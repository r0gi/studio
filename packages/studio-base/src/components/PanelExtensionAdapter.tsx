// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useTheme } from "@fluentui/react";
import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";

import Logger from "@foxglove/log";
import { fromSec, toSec } from "@foxglove/rostime";
import {
  AppSettingValue,
  ExtensionPanelRegistration,
  MessageEvent,
  PanelExtensionContext,
  ParameterValue,
  RenderState,
  Topic,
} from "@foxglove/studio";
import {
  MessagePipelineContext,
  useMessagePipeline,
} from "@foxglove/studio-base/components/MessagePipeline";
import { usePanelContext } from "@foxglove/studio-base/components/PanelContext";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import { SettingsTree } from "@foxglove/studio-base/components/SettingsTreeEditor/types";
import { useAppConfiguration } from "@foxglove/studio-base/context/AppConfigurationContext";
import {
  useClearHoverValue,
  useHoverValue,
  useSetHoverValue,
} from "@foxglove/studio-base/context/HoverValueContext";
import {
  AdvertiseOptions,
  PlayerCapabilities,
  PlayerState,
} from "@foxglove/studio-base/players/types";
import { usePanelSettingsTreeUpdate } from "@foxglove/studio-base/providers/PanelSettingsEditorContextProvider";
import { PanelConfig, SaveConfig } from "@foxglove/studio-base/types/panels";
import { assertNever } from "@foxglove/studio-base/util/assertNever";

const log = Logger.getLogger(__filename);

type PanelExtensionAdapterProps = {
  /** function that initializes the panel extension */
  initPanel: ExtensionPanelRegistration["initPanel"];

  config: unknown;
  saveConfig: SaveConfig<unknown>;

  /** Help document for the panel */
  help?: string;
};

const EmptyParameters = new Map<string, ParameterValue>();

const EmptyTopics: readonly Topic[] = [];

function selectSetSubscriptions(ctx: MessagePipelineContext) {
  return ctx.setSubscriptions;
}

function selectRequestBackfill(ctx: MessagePipelineContext) {
  return ctx.requestBackfill;
}

function selectCapabilities(ctx: MessagePipelineContext) {
  return ctx.playerState.capabilities;
}

function selectSeekPlayback(ctx: MessagePipelineContext) {
  return ctx.seekPlayback;
}

type RenderFn = (renderState: Readonly<RenderState>, done: () => void) => void;

/**
 * PanelExtensionAdapter renders a panel extension via initPanel
 *
 * The adapter creates a PanelExtensionContext and invokes initPanel using the context.
 */
function PanelExtensionAdapter(props: PanelExtensionAdapterProps): JSX.Element {
  const { initPanel, config, saveConfig } = props;

  // We don't want changes to the config value to re-invoke initPanel in useLayoutEffect
  const configRef = useRef(config);

  const setSubscriptions = useMessagePipeline(selectSetSubscriptions);
  const requestBackfill = useMessagePipeline(selectRequestBackfill);
  const capabilities = useMessagePipeline(selectCapabilities);
  const seekPlayback = useMessagePipeline(selectSeekPlayback);
  const { openSiblingPanel } = usePanelContext();

  const [panelId] = useState(() => uuid());

  const [error, setError] = useState<Error | undefined>();
  const watchedFieldsRef = useRef(new Set<keyof RenderState>());
  const subscribedTopicsRef = useRef(new Set<string>());
  const currentAppSettingsRef = useRef(new Map<string, AppSettingValue>());
  const [subscribedAppSettings, setSubscribedAppSettings] = useState<string[]>([]);
  const previousPlayerStateRef = useRef<PlayerState | undefined>(undefined);

  // To avoid updating extended message stores once message pipeline blocks are no longer updating
  // we store a ref to the blocks and only update stores when the ref is different
  // Note: when subscribing to new topics this ref is unset to re-calculate the allFrames value with
  // newly subscribed topics.
  const prevBlocksRef = useRef<unknown>(undefined);

  const [renderFn, setRenderFn] = useState<RenderFn | undefined>();

  const renderingRef = useRef<boolean>(false);
  const prevRenderState = useRef<RenderState>({});

  const latestPipelineContextRef = useRef<MessagePipelineContext | undefined>(undefined);

  const [slowRender, setSlowRender] = useState(false);

  // we use message pipeline selector to capture updates and don't need to request animation frames
  // multiple times so we gate requesting new message frames
  const rafRequestedRef = useRef<number | undefined>(undefined);

  const hoverValue = useHoverValue({
    componentId: "PanelExtensionAdatper",
    isTimestampScale: true,
  });
  const setHoverValue = useSetHoverValue();
  const clearHoverValue = useClearHoverValue();

  // track the advertisements requested by the panel context
  // topic -> advertisement
  const advertisementsRef = useRef(new Map<string, AdvertiseOptions>());

  // To avoid re-creating the renderPanel function when hover value changes we put it into a ref
  // It is sufficient for renderPanel to use the latest value when called.
  const hoverValueRef = useRef<typeof hoverValue>();
  hoverValueRef.current = hoverValue;

  const colorScheme = useTheme().isInverted ? "dark" : "light";

  const appConfiguration = useAppConfiguration();

  // renderPanelImpl invokes the panel extension context's render function with updated
  // render state fields.
  //
  // NOTE: Do not call renderPanelImpl directly, always call queueRender()
  const renderPanelImpl = useCallback(() => {
    if (!renderFn) {
      return;
    }

    rafRequestedRef.current = undefined;

    const ctx = latestPipelineContextRef.current;

    const playerState = ctx?.playerState;
    previousPlayerStateRef.current = playerState;

    if (renderingRef.current) {
      setSlowRender(true);
      return;
    }
    setSlowRender(false);

    // Should render indicates whether any fields of render state are updated
    let shouldRender = false;

    // The render state stats with the previous render state and changes are applied as detected
    const renderState: RenderState = prevRenderState.current;

    if (watchedFieldsRef.current.has("currentFrame")) {
      const currentFrame = ctx?.messageEventsBySubscriberId.get(panelId);

      // If there are new frames we render
      // If there are old frames we render (new frames either replace old or no new frames)
      // Note: renderState.currentFrame.length !== currentFrame.length is wrong because it
      // won't render when the number of messages is the same from old to new
      if (renderState.currentFrame?.length !== 0 || currentFrame?.length !== 0) {
        shouldRender = true;
        renderState.currentFrame = currentFrame;
      }
    }

    if (watchedFieldsRef.current.has("parameters")) {
      const parameters = playerState?.activeData?.parameters ?? EmptyParameters;
      if (parameters !== renderState.parameters) {
        shouldRender = true;
        renderState.parameters = parameters;
      }
    }

    if (watchedFieldsRef.current.has("topics")) {
      const newTopics = playerState?.activeData?.topics ?? EmptyTopics;
      if (newTopics !== prevRenderState.current.topics) {
        shouldRender = true;
        renderState.topics = newTopics;
      }
    }

    if (watchedFieldsRef.current.has("allFrames")) {
      // see comment for prevBlocksRef on why extended message store updates are gated this way
      const newBlocks = playerState?.progress.messageCache?.blocks;
      if (newBlocks && prevBlocksRef.current !== newBlocks) {
        shouldRender = true;
        const frames: MessageEvent<unknown>[] = (renderState.allFrames = []);
        for (const block of newBlocks) {
          if (!block) {
            continue;
          }

          for (const messageEvents of Object.values(block.messagesByTopic)) {
            for (const messageEvent of messageEvents) {
              if (!subscribedTopicsRef.current.has(messageEvent.topic)) {
                continue;
              }
              frames.push(messageEvent);
            }
          }
        }
      }
      prevBlocksRef.current = newBlocks;
    }

    if (watchedFieldsRef.current.has("currentTime")) {
      const currentTime = playerState?.activeData?.currentTime;

      if (currentTime != undefined && currentTime !== renderState.currentTime) {
        shouldRender = true;
        renderState.currentTime = currentTime;
      } else {
        if (renderState.currentTime != undefined) {
          shouldRender = true;
        }
        renderState.currentTime = undefined;
      }
    }

    if (watchedFieldsRef.current.has("previewTime")) {
      const startTime = playerState?.activeData?.startTime;
      const hoverVal = hoverValueRef.current?.value;

      if (startTime != undefined && hoverVal != undefined) {
        const stamp = toSec(startTime) + hoverVal;
        if (stamp !== renderState.previewTime) {
          shouldRender = true;
        }
        renderState.previewTime = stamp;
      } else {
        if (renderState.previewTime != undefined) {
          shouldRender = true;
        }
        renderState.previewTime = undefined;
      }
    }

    if (watchedFieldsRef.current.has("colorScheme")) {
      if (colorScheme !== renderState.colorScheme) {
        shouldRender = true;
        renderState.colorScheme = colorScheme;
      }
    }

    if (watchedFieldsRef.current.has("appSettings")) {
      if (renderState.appSettings !== currentAppSettingsRef.current) {
        shouldRender = true;
        renderState.appSettings = currentAppSettingsRef.current;
      }
    }

    if (!shouldRender) {
      return;
    }

    // tell the panel to render and lockout future renders until rendering is complete
    renderingRef.current = true;
    try {
      setError(undefined);
      let doneCalled = false;
      renderFn(renderState, () => {
        // ignore any additional done calls from the panel
        if (doneCalled) {
          return;
        }
        doneCalled = true;
        renderingRef.current = false;
      });
    } catch (err) {
      setError(err);
    }
  }, [colorScheme, panelId, renderFn]);

  const queueRender = useCallback(() => {
    if (!renderFn || rafRequestedRef.current != undefined) {
      return;
    }
    rafRequestedRef.current = requestAnimationFrame(renderPanelImpl);
  }, [renderFn, renderPanelImpl]);

  // Queue render when message pipeline has new data
  const messagePipelineSelector = useCallback(
    (ctx: MessagePipelineContext) => {
      latestPipelineContextRef.current = ctx;
      queueRender();
    },
    [queueRender],
  );

  useEffect(() => {
    const handlers = new Map<string, (newValue: AppSettingValue) => void>();
    for (const key of subscribedAppSettings) {
      currentAppSettingsRef.current.set(key, appConfiguration.get(key));

      const handler = (newValue: AppSettingValue) => {
        currentAppSettingsRef.current = new Map(currentAppSettingsRef.current);
        currentAppSettingsRef.current.set(key, newValue);
        queueRender();
      };
      handlers.set(key, handler);
      appConfiguration.addChangeListener(key, handler);
    }

    currentAppSettingsRef.current = new Map(currentAppSettingsRef.current);
    queueRender();

    return () => {
      for (const [key, handler] of handlers.entries()) {
        appConfiguration.removeChangeListener(key, handler);
      }
    };
  }, [appConfiguration, queueRender, subscribedAppSettings]);

  // Queue render on hover value changes which occur outside the message pipeline
  useLayoutEffect(() => {
    // No need to queue render if not interested in preview time
    if (watchedFieldsRef.current.has("previewTime")) {
      queueRender();
    }
  }, [hoverValue, queueRender]);

  useMessagePipeline(messagePipelineSelector);

  const updatePanelSettingsTree = usePanelSettingsTreeUpdate();
  const { id: panelLayoutId } = usePanelContext();

  const updateSettings = useCallback(
    (settings: SettingsTree) => {
      updatePanelSettingsTree(panelLayoutId, settings);
    },
    [panelLayoutId, updatePanelSettingsTree],
  );

  type PartialPanelExtensionContext = Omit<PanelExtensionContext, "panelElement">;
  const partialExtensionContext = useMemo<PartialPanelExtensionContext>(() => {
    const layout: PanelExtensionContext["layout"] = {
      addPanel({ position, type, updateIfExists, getState }) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (position === "sibling") {
          openSiblingPanel({
            panelType: type,
            updateIfExists,
            siblingConfigCreator: (existingConfig) => getState(existingConfig) as PanelConfig,
          });
          return;
        }
        assertNever(position, `Unsupported position for addPanel: ${position}`);
      },
    };

    return {
      // This is here temporarily until the new panel settings API is ready. Do not use.
      __updatePanelSettingsTree: updateSettings,

      initialState: configRef.current,

      saveState: saveConfig,

      layout,

      seekPlayback: seekPlayback ? (stamp: number) => seekPlayback(fromSec(stamp)) : undefined,

      setParameter: (name: string, value: ParameterValue) => {
        const ctx = latestPipelineContextRef.current;
        ctx?.setParameter(name, value);
      },

      setPreviewTime: (stamp: number | undefined) => {
        if (stamp == undefined) {
          clearHoverValue("PanelExtensionAdatper");
        } else {
          const ctx = latestPipelineContextRef.current;
          const startTime = ctx?.playerState.activeData?.startTime;
          // if we don't have a start time we cannot correctly set the playback seconds hover value
          // this hover value needs seconds from start
          if (!startTime) {
            return;
          }
          const secondsFromStart = stamp - toSec(startTime);
          setHoverValue({
            type: "PLAYBACK_SECONDS",
            componentId: "PanelExtensionAdatper",
            value: secondsFromStart,
          });
        }
      },

      watch: (field: keyof RenderState) => {
        watchedFieldsRef.current.add(field);
      },

      subscribe: (topics: string[]) => {
        subscribedTopicsRef.current.clear();

        // If the player has loaded all the blocks, the blocks reference won't change so our message
        // pipeline handler for allFrames won't create a new set of all frames for the newly
        // subscribed topic. To ensure a new set of allFrames with the newly subscribed topic is
        // created, we unset the blocks ref which will force re-creating allFrames.
        prevBlocksRef.current = undefined;

        const subscribePayloads = topics.map((topic) => ({ topic }));
        setSubscriptions(panelId, subscribePayloads);
        for (const topic of topics) {
          subscribedTopicsRef.current.add(topic);
        }

        if (topics.length > 0) {
          requestBackfill();
        }
      },

      advertise: capabilities.includes(PlayerCapabilities.advertise)
        ? (topic: string, datatype: string, options) => {
            const ctx = latestPipelineContextRef.current;
            if (!ctx) {
              throw new Error("Unable to advertise. There is no active connection.");
            }

            const payload: AdvertiseOptions = {
              topic,
              datatype,
              options,
            };
            advertisementsRef.current.set(topic, payload);

            ctx.setPublishers(panelId, Array.from(advertisementsRef.current.values()));
          }
        : undefined,

      unadvertise: capabilities.includes(PlayerCapabilities.advertise)
        ? (topic: string) => {
            const ctx = latestPipelineContextRef.current;
            if (!ctx) {
              throw new Error("Unable to advertise. There is no active connection.");
            }

            advertisementsRef.current.delete(topic);
            ctx.setPublishers(panelId, Array.from(advertisementsRef.current.values()));
          }
        : undefined,

      publish: capabilities.includes(PlayerCapabilities.advertise)
        ? (topic, message) => {
            const ctx = latestPipelineContextRef.current;
            if (!ctx) {
              throw new Error("Unable to publish. There is no active connection.");
            }
            ctx.publish({
              topic,
              msg: message as Record<string, unknown>,
            });
          }
        : undefined,

      unsubscribeAll: () => {
        subscribedTopicsRef.current.clear();
        setSubscriptions(panelId, []);
      },

      subscribeAppSettings: (settings: string[]) => {
        setSubscribedAppSettings(settings);
      },
    };
  }, [
    capabilities,
    clearHoverValue,
    openSiblingPanel,
    panelId,
    updateSettings,
    requestBackfill,
    saveConfig,
    seekPlayback,
    setHoverValue,
    setSubscriptions,
  ]);

  const panelContainerRef = useRef<HTMLDivElement>(ReactNull);

  // Manage extension lifecycle by calling initPanel() when the panel context changes.
  //
  // If we useEffect here instead of useLayoutEffect, the prevRenderState can get polluted with data
  // from a previous panel instance.
  useLayoutEffect(() => {
    if (!panelContainerRef.current) {
      throw new Error("Expected panel container to be mounted");
    }

    // Reset local state when the panel element is mounted or changes
    setRenderFn(undefined);
    prevRenderState.current = {};
    if (rafRequestedRef.current != undefined) {
      // Any pending render requests from the previously mounted panel must be canceled, because
      // when they render they will change prevRenderState. Clearing prevRenderState here allows the
      // newly mounted panel to receive the correct renderState.
      cancelAnimationFrame(rafRequestedRef.current);
      rafRequestedRef.current = undefined;
    }

    const panelElement = document.createElement("div");
    panelElement.style.width = "100%";
    panelElement.style.height = "100%";
    panelElement.style.overflow = "hidden";
    panelContainerRef.current.appendChild(panelElement);

    log.info(`Init panel ${panelId}`);
    initPanel({
      panelElement,
      ...partialExtensionContext,

      // eslint-disable-next-line no-restricted-syntax
      set onRender(renderFunction: RenderFn | undefined) {
        setRenderFn(() => renderFunction);
      },
    });

    return () => {
      panelElement.remove();
      latestPipelineContextRef.current?.setSubscriptions(panelId, []);
      latestPipelineContextRef.current?.setPublishers(panelId, []);
    };
  }, [initPanel, panelId, partialExtensionContext]);

  const style: CSSProperties = {};
  if (slowRender) {
    style.borderColor = "orange";
    style.borderWidth = "1px";
    style.borderStyle = "solid";
  }

  if (error) {
    throw error;
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", zIndex: 0, ...style }}>
      <PanelToolbar helpContent={props.help} />
      <div style={{ width: "100%", height: "100%", overflow: "hidden" }} ref={panelContainerRef} />
    </div>
  );
}

export default PanelExtensionAdapter;

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as THREE from "three";

import { SettingsTreeFields } from "@foxglove/studio-base/components/SettingsTreeEditor/types";

import { Renderer } from "../Renderer";
import { rgbaToCssString, stringToRgba } from "../color";
import {
  CameraInfo,
  Pose,
  rosTimeToNanoSec,
  ColorRGBA,
  Marker,
  MarkerAction,
  MarkerType,
  Vector3,
} from "../ros";
import { LayerSettingsCameraInfo, LayerType } from "../settings";
import { makePose } from "../transforms/geometry";
import { updatePose } from "../updatePose";
import { RenderableLineList } from "./markers/RenderableLineList";
import { missingTransformMessage, MISSING_TRANSFORM } from "./transforms";

const DEFAULT_DISTANCE = 3;
const DEFAULT_COLOR = { r: 124 / 255, g: 107 / 255, b: 1, a: 1 };

const DEFAULT_COLOR_STR = rgbaToCssString(DEFAULT_COLOR);

const DEFAULT_SETTINGS: LayerSettingsCameraInfo = {
  visible: true,
  distance: DEFAULT_DISTANCE,
  color: DEFAULT_COLOR_STR,
};

type CameraInfoRenderable = THREE.Object3D & {
  userData: {
    topic: string;
    settings: LayerSettingsCameraInfo;
    cameraInfo: CameraInfo;
    pose: Pose;
    srcTime: bigint;
    lines: RenderableLineList;
  };
};

export class Cameras extends THREE.Object3D {
  renderer: Renderer;
  camerasByTopic = new Map<string, CameraInfoRenderable>();

  constructor(renderer: Renderer) {
    super();
    this.renderer = renderer;

    renderer.setSettingsFieldsProvider(LayerType.CameraInfo, (topicConfig, _topic) => {
      const cur = topicConfig as Partial<LayerSettingsCameraInfo>;
      const distance = cur.distance ?? DEFAULT_DISTANCE;
      const color = cur.color ?? DEFAULT_COLOR_STR;

      const fields: SettingsTreeFields = {
        distance: { label: "Distance", input: "number", min: 0, value: distance, step: 0.1 },
        color: { label: "Color", input: "rgba", value: color },
      };

      return fields;
    });
  }

  dispose(): void {
    for (const renderable of this.camerasByTopic.values()) {
      renderable.userData.lines.dispose();
    }
    this.children.length = 0;
    this.camerasByTopic.clear();
  }

  addCameraInfoMessage(topic: string, cameraInfo: CameraInfo): void {
    let renderable = this.camerasByTopic.get(topic);
    if (!renderable) {
      renderable = new THREE.Object3D() as CameraInfoRenderable;
      renderable.name = topic;
      renderable.userData.topic = topic;

      // Set the initial settings from default values merged with any user settings
      const userSettings = this.renderer.config?.topics[topic] as
        | Partial<LayerSettingsCameraInfo>
        | undefined;
      const settings = { ...DEFAULT_SETTINGS, ...userSettings };
      renderable.userData.settings = settings;

      renderable.userData.cameraInfo = cameraInfo;
      renderable.userData.srcTime = rosTimeToNanoSec(cameraInfo.header.stamp);
      renderable.userData.pose = makePose();

      // Synthesize an arrow marker to instantiate a RenderableArrow
      const marker = createLineListMarker(cameraInfo, settings);
      renderable.userData.lines = new RenderableLineList(topic, marker, this.renderer);
      renderable.add(renderable.userData.lines);

      this.add(renderable);
      this.camerasByTopic.set(topic, renderable);
    }

    this._updateCameraInfoRenderable(renderable, cameraInfo);
  }

  setTopicSettings(topic: string, settings: Partial<LayerSettingsCameraInfo>): void {
    const renderable = this.camerasByTopic.get(topic);
    if (renderable) {
      renderable.userData.settings = { ...renderable.userData.settings, ...settings };
      this._updateCameraInfoRenderable(renderable, renderable.userData.cameraInfo);
    }
  }

  startFrame(currentTime: bigint): void {
    const renderFrameId = this.renderer.renderFrameId;
    const fixedFrameId = this.renderer.fixedFrameId;
    if (renderFrameId == undefined || fixedFrameId == undefined) {
      this.visible = false;
      return;
    }
    this.visible = true;

    for (const renderable of this.camerasByTopic.values()) {
      renderable.visible = renderable.userData.settings.visible;
      if (!renderable.visible) {
        this.renderer.layerErrors.clearTopic(renderable.userData.topic);
        continue;
      }

      const srcTime = currentTime;
      const frameId = renderable.userData.cameraInfo.header.frame_id;
      const updated = updatePose(
        renderable,
        this.renderer.transformTree,
        renderFrameId,
        fixedFrameId,
        frameId,
        currentTime,
        srcTime,
      );
      if (!updated) {
        const message = missingTransformMessage(renderFrameId, fixedFrameId, frameId);
        this.renderer.layerErrors.addToTopic(renderable.userData.topic, MISSING_TRANSFORM, message);
      }
    }
  }

  _updateCameraInfoRenderable(renderable: CameraInfoRenderable, cameraInfo: CameraInfo): void {
    const marker = createLineListMarker(cameraInfo, renderable.userData.settings);
    renderable.userData.lines.update(marker);
  }
}

function makeRgba(): ColorRGBA {
  return { r: 0, g: 0, b: 0, a: 0 };
}

function createLineListMarker(cameraInfo: CameraInfo, settings: LayerSettingsCameraInfo): Marker {
  const points: Vector3[] = [];
  return {
    header: cameraInfo.header,
    ns: "",
    id: 0,
    type: MarkerType.ARROW,
    action: MarkerAction.ADD,
    pose: makePose(),
    scale: { x: 1, y: 1, z: 1 },
    color: stringToRgba(makeRgba(), settings.color),
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    points,
    colors: [],
    text: "",
    mesh_resource: "",
    mesh_use_embedded_materials: false,
  };
}

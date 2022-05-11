// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useMemo, useEffect, useState } from "react";

import {
  IDataSourceFactory,
  Ros1LocalBagDataSourceFactory,
  Ros2LocalBagDataSourceFactory,
  RosbridgeDataSourceFactory,
  VelodyneDataSourceFactory,
  Ros1RemoteBagDataSourceFactory,
  Ros1SocketDataSourceFactory,
  Ros2SocketDataSourceFactory,
  FoxgloveDataPlatformDataSourceFactory,
  FoxgloveWebSocketDataSourceFactory,
  UlogLocalDataSourceFactory,
  McapLocalDataSourceFactory,
  SampleNuscenesDataSourceFactory,
  McapRemoteDataSourceFactory,
  IAppConfiguration,
  AppSetting,
  App,
  ConsoleApi,
} from "@foxglove/studio-base";

import { Desktop, NativeMenuBridge, Storage } from "../common/types";
import { DesktopExtensionLoader } from "./services/DesktopExtensionLoader";
import { NativeAppMenu } from "./services/NativeAppMenu";
import NativeStorageLayoutStorage from "./services/NativeStorageLayoutStorage";
import { NativeWindow } from "./services/NativeWindow";

const desktopBridge = (global as unknown as { desktopBridge: Desktop }).desktopBridge;
const storageBridge = (global as unknown as { storageBridge?: Storage }).storageBridge;
const menuBridge = (global as { menuBridge?: NativeMenuBridge }).menuBridge;

export default function Root({
  appConfiguration,
}: {
  appConfiguration: IAppConfiguration;
}): JSX.Element {
  const enableExperimentalBagPlayer: boolean =
    (appConfiguration.get(AppSetting.EXPERIMENTAL_BAG_PLAYER) as boolean | undefined) ?? false;
  const enableExperimentalDataPlatformPlayer: boolean =
    (appConfiguration.get(AppSetting.EXPERIMENTAL_DATA_PLATFORM_PLAYER) as boolean | undefined) ??
    false;
  const enableExperimentalMcapPlayer: boolean =
    (appConfiguration.get(AppSetting.EXPERIMENTAL_MCAP_PLAYER) as boolean | undefined) ?? false;

  const dataSources: IDataSourceFactory[] = useMemo(() => {
    const sources = [
      new RosbridgeDataSourceFactory(),
      new FoxgloveWebSocketDataSourceFactory(),
      new Ros1SocketDataSourceFactory(),
      new Ros1LocalBagDataSourceFactory({ useIterablePlayer: enableExperimentalBagPlayer }),
      new Ros1RemoteBagDataSourceFactory({ useIterablePlayer: enableExperimentalBagPlayer }),
      new Ros2SocketDataSourceFactory(),
      new Ros2LocalBagDataSourceFactory(),
      new UlogLocalDataSourceFactory(),
      new VelodyneDataSourceFactory(),
      new FoxgloveDataPlatformDataSourceFactory({
        useIterablePlayer: enableExperimentalDataPlatformPlayer,
      }),
      new SampleNuscenesDataSourceFactory({ useIterablePlayer: enableExperimentalBagPlayer }),
      new McapLocalDataSourceFactory({ useIterablePlayer: enableExperimentalMcapPlayer }),
      new McapRemoteDataSourceFactory(),
    ];

    return sources;
  }, [
    enableExperimentalBagPlayer,
    enableExperimentalDataPlatformPlayer,
    enableExperimentalMcapPlayer,
  ]);

  if (!storageBridge) {
    throw new Error("storageBridge is missing");
  }

  useEffect(() => {
    const handler = () => {
      void desktopBridge.updateNativeColorScheme();
    };

    appConfiguration.addChangeListener(AppSetting.COLOR_SCHEME, handler);
    return () => {
      appConfiguration.removeChangeListener(AppSetting.COLOR_SCHEME, handler);
    };
  }, [appConfiguration]);

  const layoutStorage = useMemo(() => new NativeStorageLayoutStorage(storageBridge), []);
  const extensionLoader = useMemo(() => new DesktopExtensionLoader(desktopBridge), []);
  const consoleApi = useMemo(() => new ConsoleApi(process.env.FOXGLOVE_API_URL!), []);
  const nativeAppMenu = useMemo(() => new NativeAppMenu(menuBridge), []);
  const nativeWindow = useMemo(() => new NativeWindow(desktopBridge), []);

  // App url state in window.location will represent the user's current session state
  // better than the initial deep link so we prioritize the current window.location
  // url for startup state. This persists state across user-initiated refreshes.
  const [deepLinks] = useState(() => {
    // We treat presence of the `ds` or `layoutId` params as indicative of active state.
    const windowUrl = new URL(window.location.href);
    const hasActiveURLState =
      windowUrl.searchParams.has("ds") || windowUrl.searchParams.has("layoutId");
    return hasActiveURLState ? [window.location.href] : desktopBridge.getDeepLinks();
  });

  return (
    <App
      enableDialogAuth
      deepLinks={deepLinks}
      dataSources={dataSources}
      appConfiguration={appConfiguration}
      consoleApi={consoleApi}
      layoutStorage={layoutStorage}
      extensionLoader={extensionLoader}
      nativeAppMenu={nativeAppMenu}
      nativeWindow={nativeWindow}
    />
  );
}

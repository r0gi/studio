// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Link, Typography } from "@mui/material";
import { ReactElement, useEffect } from "react";

import { AppSetting } from "@foxglove/studio-base/AppSetting";
import Stack from "@foxglove/studio-base/components/Stack";
import { useSessionStorageValue } from "@foxglove/studio-base/hooks/useSessionStorageValue";

export function LaunchingInDesktopScreen(): ReactElement {
  const [, setLaunchPreference] = useSessionStorageValue(AppSetting.LAUNCH_PREFERENCE);

  const cleanWebURL = new URL(window.location.href);
  cleanWebURL.searchParams.delete("launch");

  function openWeb() {
    setLaunchPreference("web");
    window.location.href = cleanWebURL.href;
  }

  useEffect(() => {
    const desktopURL = new URL("foxglove://open");
    cleanWebURL.searchParams.forEach((v, k) => {
      if (k && v) {
        desktopURL.searchParams.set(k, v);

        // Temporarily send both sets of params until desktop app is updated to
        // use new ds.* parameters.
        switch (k) {
          case "ds":
            desktopURL.searchParams.set("type", v);
            break;
          case "ds.deviceId":
            desktopURL.searchParams.set("deviceId", v);
            break;
          case "ds.end":
            desktopURL.searchParams.set("end", v);
            break;
          case "ds.start":
            desktopURL.searchParams.set("start", v);
            break;
          case "ds.url":
            desktopURL.searchParams.set("url", v);
            break;
          case "time":
            desktopURL.searchParams.set("seekTo", v);
            break;
        }
      }
    });

    window.location.href = desktopURL.href;
  });

  return (
    <Stack alignItems="center" justifyContent="center" fullHeight>
      <Stack
        alignItems="center"
        justifyContent="center"
        fullHeight
        gap={2.5}
        style={{ maxWidth: 480 }}
      >
        <Typography align="center" variant="h2">
          Launching Foxglove Studio…
        </Typography>
        <Typography align="center">We’ve directed you to the desktop app.</Typography>
        <Stack gap={0.5}>
          <Typography align="center">
            You can also <Link onClick={openWeb}>open this link in your browser</Link>.
          </Typography>
          <Typography align="center">
            Don’t have the app installed?&nbsp;
            <Link href="https://foxglove.dev/download">Download Foxglove Studio</Link>
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
}

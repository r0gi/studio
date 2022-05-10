// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { Checkbox } from "@fluentui/react";
import { Link, Typography } from "@mui/material";

import { AppSetting } from "@foxglove/studio-base/AppSetting";
import Stack from "@foxglove/studio-base/components/Stack";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks/useAppConfigurationValue";

type Feature = {
  key: AppSetting;
  name: string;
  description: JSX.Element;
};

const features: Feature[] = [
  {
    key: AppSetting.UNLIMITED_MEMORY_CACHE,
    name: "Unlimited in-memory cache",
    description: (
      <>
        Fully buffer a bag into memory. This may use up a lot of system memory. Changing this
        setting requires a restart.
      </>
    ),
  },
  {
    key: AppSetting.SHOW_DEBUG_PANELS,
    name: "Studio debug panels",
    description: <>Show Foxglove Studio debug panels in the &ldquo;Add panel&rdquo; list.</>,
  },
  {
    key: AppSetting.ENABLE_LEGACY_PLOT_PANEL,
    name: "Legacy Plot panel",
    description: <>Enable the Legacy Plot panel.</>,
  },
  {
    key: AppSetting.EXPERIMENTAL_BAG_PLAYER,
    name: "Experimental bag player",
    description: (
      <>The experimental bag player uses a new approach to loading messages from bag files.</>
    ),
  },
  {
    key: AppSetting.EXPERIMENTAL_DATA_PLATFORM_PLAYER,
    name: "Experimental data platform player",
    description: (
      <>
        The experimental data platform player uses a new approach to loading messages from Foxglove
        Data Platform.
      </>
    ),
  },
  {
    key: AppSetting.EXPERIMENTAL_MCAP_PLAYER,
    name: "Experimental mcap player",
    description: (
      <>The experimental mcap player uses a new approach to loading messages from mcap files.</>
    ),
  },
  {
    key: AppSetting.EXPERIMENTAL_3D_PANEL,
    name: "Experimental 3D panel",
    description: <>Enable the experimental 3D panel.</>,
  },
];
if (process.env.NODE_ENV === "development") {
  features.push({
    key: AppSetting.ENABLE_LAYOUT_DEBUGGING,
    name: "Layout debugging",
    description: <>Show extra controls for developing and debugging layout storage.</>,
  });
  features.push({
    key: AppSetting.ENABLE_REACT_STRICT_MODE,
    name: "React Strict Mode",
    description: (
      <>
        Enable React{" "}
        <Link href="https://reactjs.org/docs/strict-mode.html" target="_blank" rel="noreferrer">
          Strict Mode
        </Link>
        . Changing this setting requires a restart.
      </>
    ),
  });
}

function ExperimentalFeatureItem(props: { feature: Feature }) {
  const { feature } = props;

  const [enabled, setEnabled] = useAppConfigurationValue<boolean>(feature.key);
  return (
    <Stack gap={2}>
      <Stack flexGrow={1} gap={0.5}>
        <Checkbox
          onRenderLabel={() => {
            return (
              <Stack gap={0.5} paddingLeft={0.5}>
                <Typography fontWeight={600}>{feature.name}</Typography>
                <Typography color="text.secondary">{feature.description}</Typography>
              </Stack>
            );
          }}
          checked={enabled}
          onChange={(_, checked) => void setEnabled(checked)}
          styles={{
            text: {
              minWidth: 60,
            },
            label: { alignItems: "baseline" },
          }}
        />
      </Stack>
    </Stack>
  );
}

export function ExperimentalFeatureSettings(): React.ReactElement {
  return (
    <Stack gap={2}>
      {features.length === 0 && (
        <Typography>
          <em>Currently there are no experimental features.</em>
        </Typography>
      )}
      {features.map((feature) => (
        <ExperimentalFeatureItem key={feature.key} feature={feature} />
      ))}
    </Stack>
  );
}

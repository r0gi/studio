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

import FullscreenExitIcon from "@mdi/svg/svg/fullscreen-exit.svg";
import FullscreenIcon from "@mdi/svg/svg/fullscreen.svg";
import HelpCircleOutlineIcon from "@mdi/svg/svg/help-circle-outline.svg";
import { styled as muiStyled, Theme } from "@mui/material";
import { makeStyles } from "@mui/styles";
import { useContext, useState, useMemo, useRef } from "react";

import Icon from "@foxglove/studio-base/components/Icon";
import PanelContext from "@foxglove/studio-base/components/PanelContext";
import { useWorkspace } from "@foxglove/studio-base/context/WorkspaceContext";
import { usePanelMousePresence } from "@foxglove/studio-base/hooks/usePanelMousePresence";
import { HelpInfoStore, useHelpInfo } from "@foxglove/studio-base/providers/HelpInfoProvider";

import { PanelToolbarControls } from "./PanelToolbarControls";

type Props = {
  additionalIcons?: React.ReactNode;
  alwaysVisible?: boolean;
  children?: React.ReactNode;
  floating?: boolean;
  helpContent?: React.ReactNode;
  hideToolbars?: boolean;
  isUnknownPanel?: boolean;
};

const PanelToolbarRoot = muiStyled("div")(({ theme }) => ({
  transition: "transform 80ms ease-in-out, opacity 80ms ease-in-out",
  flex: "0 0 auto",
  justifyContent: "flex-end",
  padding: theme.spacing(0.5),
  display: "flex",
  minHeight: 32,
  backgroundColor: theme.palette.background.paper,
  width: "100%",
  left: 0,
}));

const useStyles = makeStyles((theme: Theme) => ({
  icon: {
    fontSize: 14,
    margin: theme.spacing(0, 0.125),
  },
}));

const selectSetHelpInfo = (store: HelpInfoStore) => store.setHelpInfo;

// Panel toolbar should be added to any panel that's part of the
// react-mosaic layout.  It adds a drag handle, remove/replace controls
// and has a place to add custom controls via it's children property
export default React.memo<Props>(function PanelToolbar({
  additionalIcons,
  alwaysVisible = false,
  children,
  floating = false,
  helpContent,
  hideToolbars = false,
  isUnknownPanel = false,
}: Props) {
  const styles = useStyles();
  const { isFullscreen, enterFullscreen, exitFullscreen } = useContext(PanelContext) ?? {};
  const [menuOpen, setMenuOpen] = useState(false);

  const panelContext = useContext(PanelContext);
  const { openHelp } = useWorkspace();

  const setHelpInfo = useHelpInfo(selectSetHelpInfo);

  // Help-shown state must be hoisted outside the controls container so the modal can remain visible
  // when the panel is no longer hovered.
  const additionalIconsWithHelp = useMemo(() => {
    return (
      <>
        {additionalIcons}
        {Boolean(helpContent) && (
          <Icon
            tooltip="Help"
            fade
            onClick={() => {
              if (panelContext?.title != undefined) {
                setHelpInfo({ title: panelContext.title, content: helpContent });
                openHelp();
              }
            }}
          >
            <HelpCircleOutlineIcon className={styles.icon} />
          </Icon>
        )}
        {isFullscreen === false && (
          <Icon
            fade
            tooltip="Fullscreen"
            dataTest="panel-toolbar-fullscreen"
            onClick={enterFullscreen}
          >
            <FullscreenIcon />
          </Icon>
        )}
        {isFullscreen === true && (
          <Icon fade tooltip="Exit fullscreen" onClick={exitFullscreen}>
            <FullscreenExitIcon />
          </Icon>
        )}
      </>
    );
  }, [
    additionalIcons,
    openHelp,
    setHelpInfo,
    panelContext?.title,
    helpContent,
    styles.icon,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
  ]);

  // floating toolbars only show when hovered - but hovering over a context menu would hide the toolbar
  // showToolbar is used to force-show elements even if not hovered
  const showToolbar = menuOpen || !!isUnknownPanel;

  const containerRef = useRef<HTMLDivElement>(ReactNull);

  const mousePresent = usePanelMousePresence(containerRef);

  if (hideToolbars) {
    return ReactNull;
  }

  return (
    <PanelToolbarRoot ref={containerRef}>
      {children}
      <PanelToolbarControls
        showControls={showToolbar || alwaysVisible}
        mousePresent={mousePresent}
        floating={floating}
        additionalIcons={additionalIconsWithHelp}
        isUnknownPanel={!!isUnknownPanel}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
    </PanelToolbarRoot>
  );
});

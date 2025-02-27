// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import PersonIcon from "@mui/icons-material/Person";
import {
  Avatar,
  Divider,
  IconButton,
  IconButtonProps,
  ListItemText,
  Menu,
  MenuItem,
  PopoverPosition,
  PopoverReference,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { forwardRef, useCallback } from "react";
import { makeStyles } from "tss-react/mui";

import Logger from "@foxglove/log";
import { APP_BAR_PRIMARY_COLOR } from "@foxglove/studio-base/components/AppBar/constants";
import { useCurrentUser, User } from "@foxglove/studio-base/context/CurrentUserContext";
import { useConfirm } from "@foxglove/studio-base/hooks/useConfirm";

const log = Logger.getLogger(__filename);

const useStyles = makeStyles()((theme) => ({
  avatar: {
    color: theme.palette.common.white,
    backgroundColor: APP_BAR_PRIMARY_COLOR,
    height: theme.spacing(3.25),
    width: theme.spacing(3.25),
    marginLeft: theme.spacing(0.5),
  },
  avatarButton: {
    padding: 0,
  },
  menuList: {
    minWidth: 200,
  },
  userIconImage: {
    objectFit: "cover",
    width: "100%",
  },
}));

type UserIconProps = IconButtonProps & {
  currentUser?: User;
};

export const UserIconButton = forwardRef<HTMLButtonElement, UserIconProps>((props, ref) => {
  const { classes } = useStyles();
  const { currentUser: me, ...otherProps } = props;

  return (
    <IconButton {...otherProps} ref={ref} className={classes.avatarButton}>
      <Avatar className={classes.avatar} variant="rounded">
        {me?.avatarImageUrl != undefined && (
          <img
            src={me.avatarImageUrl}
            referrerPolicy="same-origin"
            className={classes.userIconImage}
          />
        )}
        {me?.avatarImageUrl == undefined && <PersonIcon />}
      </Avatar>
    </IconButton>
  );
});
UserIconButton.displayName = "UserIconButton";

export function UserMenu({
  anchorEl,
  anchorReference,
  anchorPosition,
  disablePortal,
  handleClose,
  open,
}: {
  handleClose: () => void;
  anchorEl?: HTMLElement;
  anchorReference?: PopoverReference;
  anchorPosition?: PopoverPosition;
  disablePortal?: boolean;
  open: boolean;
}): JSX.Element {
  const { classes } = useStyles();
  const { currentUser, signOut } = useCurrentUser();
  const { enqueueSnackbar } = useSnackbar();
  const [confirm, confirmModal] = useConfirm();

  const beginSignOut = useCallback(async () => {
    try {
      await signOut?.();
    } catch (error) {
      log.error(error);
      enqueueSnackbar((error as Error).toString(), { variant: "error" });
    }
  }, [enqueueSnackbar, signOut]);

  const onSignoutClick = useCallback(() => {
    void confirm({
      title: "Are you sure you want to sign out?",
      ok: "Sign out",
    }).then((response) => {
      if (response === "ok") {
        void beginSignOut();
      }
    });
  }, [beginSignOut, confirm]);

  const onSettingsClick = useCallback(() => {
    window.open(process.env.FOXGLOVE_ACCOUNT_DASHBOARD_URL, "_blank");
  }, []);

  if (currentUser == undefined) {
    return <></>;
  }
  return (
    <>
      <Menu
        anchorEl={anchorEl}
        anchorReference={anchorReference}
        anchorPosition={anchorPosition}
        disablePortal={disablePortal}
        id="account-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        MenuListProps={{ className: classes.menuList }}
      >
        <MenuItem onClick={onSettingsClick}>
          <ListItemText primary={currentUser.email} />
        </MenuItem>
        <MenuItem onClick={onSettingsClick}>
          <ListItemText>User settings</ListItemText>
        </MenuItem>
        <Divider variant="middle" />
        <MenuItem onClick={onSignoutClick}>
          <ListItemText>Log out</ListItemText>
        </MenuItem>
      </Menu>
      {confirmModal}
    </>
  );
}

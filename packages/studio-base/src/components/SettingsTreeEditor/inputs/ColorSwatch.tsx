// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { styled as muiStyled } from "@mui/material";

export const ColorSwatch = muiStyled("div", {
  shouldForwardProp: (prop) => prop !== "color",
})<{ color: string }>(({ theme, color }) => ({
  backgroundColor: color,
  height: theme.spacing(2.5),
  width: theme.spacing(3),
  margin: theme.spacing(0.625),
  borderRadius: 1,
  border: `1px solid ${theme.palette.getContrastText(color)}`,
}));

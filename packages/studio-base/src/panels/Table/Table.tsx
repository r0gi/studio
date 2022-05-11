// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2020-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

/// <reference types="./react-table-config" />

import MinusIcon from "@mdi/svg/svg/minus-box-outline.svg";
import PlusIcon from "@mdi/svg/svg/plus-box-outline.svg";
import { styled as muiStyled } from "@mui/material";
import { noop } from "lodash";
import {
  useTable,
  usePagination,
  useExpanded,
  useSortBy,
  Column,
  ColumnWithLooseAccessor,
} from "react-table";

import EmptyState from "@foxglove/studio-base/components/EmptyState";
import Icon from "@foxglove/studio-base/components/Icon";
import {
  LegacyButton,
  LegacyTable,
  LegacySelect,
} from "@foxglove/studio-base/components/LegacyStyledComponents";

import TableCell from "./TableCell";
import { sanitizeAccessorPath } from "./sanitizeAccessorPath";

function getColumnsFromObject(
  val: { toJSON?: () => Record<string, unknown> },
  accessorPath: string,
): Column[] {
  const obj = val.toJSON?.() ?? val;
  const columns = [
    ...Object.keys(obj).map((accessor) => {
      const id = accessorPath.length !== 0 ? `${accessorPath}.${accessor}` : accessor;
      return {
        Header: accessor,
        accessor,
        id,
        Cell({ value, row }) {
          if (Array.isArray(value) && typeof value[0] !== "object") {
            return JSON.stringify(value);
          }

          // eslint-disable-next-line no-restricted-syntax
          if (typeof value === "object" && value != null) {
            return (
              <TableCell row={row} accessorPath={id}>
                <Table value={value} accessorPath={accessorPath} />
              </TableCell>
            );
          }

          // In case the value is null.
          return `${value}`;
        },
      } as Column;
    }),
  ];

  const Cell: ColumnWithLooseAccessor["Cell"] = ({ row }) => (
    <Icon size="medium" {...row.getToggleRowExpandedProps()} dataTest={`expand-row-${row.index}`}>
      {row.isExpanded ? <MinusIcon /> : <PlusIcon />}
    </Icon>
  );

  if (accessorPath.length === 0) {
    columns.unshift({
      id: "expander",
      Cell,
    });
  }

  return columns;
}

const STableRow = muiStyled("tr")(({ theme }) => ({
  "&:nth-child(even)": {
    backgroundColor: theme.palette.action.hover,
  },
  "&:hover": {
    backgroundColor: theme.palette.action.selected,
  },
}));

const STableHeader = muiStyled("th")<{ id: string; isSortedAsc: boolean; isSortedDesc: boolean }>(
  ({ theme, id, isSortedAsc, isSortedDesc }) => ({
    borderLeftColor: "transparent !important",
    borderRightColor: "transparent !important",
    padding: `${theme.spacing(0.5)} !important`,
    fontWeight: "bold !important",
    cursor: "pointer",
    width: "auto",
    textAlign: "left",

    ...(isSortedAsc && {
      borderBottomColor: `${theme.palette.primary.main} !important`,
    }),
    ...(isSortedDesc && {
      borderTopColor: `${theme.palette.primary.main} !important`,
    }),
    ...(id === "expander" && {
      width: 25,
    }),
  }),
);

const STableData = muiStyled("td")(({ theme }) => ({
  padding: `${theme.spacing(0.5)} !important`,
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
}));

export default function Table({
  value,
  accessorPath,
}: {
  value: unknown;
  accessorPath: string;
}): JSX.Element {
  const isNested = accessorPath.length > 0;
  const columns = React.useMemo(() => {
    if (
      // eslint-disable-next-line no-restricted-syntax
      value == null ||
      typeof value !== "object" ||
      // eslint-disable-next-line no-restricted-syntax
      (Array.isArray(value) && typeof value[0] !== "object" && value[0] != null)
    ) {
      return [];
    }

    const maybeMessage = Array.isArray(value) ? value[0] ?? {} : value;

    // Strong assumption about structure of data.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return getColumnsFromObject(maybeMessage, accessorPath);
  }, [accessorPath, value]);

  const data = React.useMemo(() => (Array.isArray(value) ? value : [value]), [value]);

  const tableInstance = useTable(
    {
      columns,
      data,
      autoResetExpanded: false,
      initialState: { pageSize: 30 },
    },
    useSortBy,
    useExpanded,
    !isNested ? usePagination : noop,
  );

  if (
    typeof value !== "object" ||
    // eslint-disable-next-line no-restricted-syntax
    value == null ||
    (!isNested && Array.isArray(value) && typeof value[0] !== "object")
  ) {
    return (
      <EmptyState>
        Cannot render primitive values in a table. Try using the Raw Messages panel instead.
      </EmptyState>
    );
  }

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    rows,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = tableInstance;

  return (
    <>
      <LegacyTable {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup, i) => {
            return (
              <STableRow {...headerGroup.getHeaderGroupProps()} key={i}>
                {headerGroup.headers.map((column) => {
                  return (
                    <STableHeader
                      isSortedAsc={column.isSorted && !(column.isSortedDesc ?? false)}
                      isSortedDesc={column.isSorted && (column.isSortedDesc ?? false)}
                      id={column.id}
                      {...column.getHeaderProps(column.getSortByToggleProps())}
                      key={column.id}
                      data-test={`column-header-${sanitizeAccessorPath(column.id)}`}
                    >
                      {column.render("Header")}
                    </STableHeader>
                  );
                })}
              </STableRow>
            );
          })}
        </thead>
        <tbody {...getTableBodyProps()}>
          {(!isNested ? page : rows).map((row) => {
            prepareRow(row);
            return (
              <STableRow {...row.getRowProps()} key={row.index}>
                {row.cells.map((cell, i) => {
                  return (
                    <STableData {...cell.getCellProps()} key={i}>
                      {cell.render("Cell")}
                    </STableData>
                  );
                })}
              </STableRow>
            );
          })}
        </tbody>
      </LegacyTable>
      {!isNested && (
        <div style={{ margin: "4px auto 0" }}>
          <LegacyButton onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
            {"<<"}
          </LegacyButton>{" "}
          <LegacyButton onClick={() => previousPage()} disabled={!canPreviousPage}>
            {"<"}
          </LegacyButton>{" "}
          <span>
            Page{" "}
            <strong>
              {pageIndex + 1} of {pageOptions.length}
            </strong>{" "}
          </span>
          <LegacyButton onClick={() => nextPage()} disabled={!canNextPage}>
            {">"}
          </LegacyButton>{" "}
          <LegacyButton onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
            {">>"}
          </LegacyButton>{" "}
          <LegacySelect
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
            }}
          >
            {[10, 20, 30, 40, 50].map((size) => (
              <option key={size} value={size}>
                Show {size}
              </option>
            ))}
          </LegacySelect>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { displayValue, titleForColumn, type DisplayRow } from "@/domain/presentation";

interface RecordTableProps {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly DisplayRow[];
  readonly detailBasePath?: string;
  readonly currencyCode?: string;
  readonly protectedFile?: Readonly<{
    kind: "pod" | "financial";
    section: string;
    parentID: string;
  }>;
}

function protectedFileLink(
  row: DisplayRow,
  file: NonNullable<RecordTableProps["protectedFile"]>,
): string | undefined {
  if (typeof row["id"] !== "string") return undefined;
  if (file.kind === "pod" && row["upload_state"] === "verified") {
    return `/office/pod/${file.parentID}/attachments/${row["id"]}/download`;
  }
  if (file.kind === "financial" && row["state"] === "stored") {
    return `/office/${file.section}/${file.parentID}/artifacts/${row["id"]}/download`;
  }
  return undefined;
}

export function RecordTable({ caption, columns, rows, detailBasePath, currencyCode, protectedFile }: RecordTableProps) {
  const hasAction = detailBasePath !== undefined || protectedFile !== undefined;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => <th scope="col" key={column}>{titleForColumn(column)}</th>)}
            {hasAction ? <th scope="col"><span className="visually-hidden">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowID = typeof row["id"] === "string" ? row["id"] : undefined;
            const fileLink = protectedFile ? protectedFileLink(row, protectedFile) : undefined;
            const presentationRow = currencyCode && typeof row["currency_code"] !== "string"
              ? { ...row, currency_code: currencyCode }
              : row;
            return (
              <tr key={rowID ?? String(index)}>
                {columns.map((column) => <td key={column}>{displayValue(column, row[column], presentationRow)}</td>)}
                {hasAction ? (
                  <td className="table-action">
                    {detailBasePath && rowID ? <Link href={`${detailBasePath}/${rowID}`}>View details</Link> : null}
                    {fileLink ? <a href={fileLink} target="_blank" rel="noreferrer">Open protected file</a> : null}
                    {protectedFile && !fileLink ? <span>Not available</span> : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

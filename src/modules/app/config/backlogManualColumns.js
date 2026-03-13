/**
 * Manual backlog table widths (percent).
 * Edit values here to control column sizes in UI.
 *
 * Notes:
 * - Values are used as-is (no auto-normalization).
 * - In By roles mode, estimation subcolumns use `estimationByRole[role]` or fallback to `estimationDefault`.
 * - In By team mode, estimation uses `estimationByTeam`.
 */
export const MANUAL_BACKLOG_COLUMN_WIDTHS = {
  index: 5,
  summary: 35,
  priority: 5,
  member: 15,
  estimationByTeam: 40,
  estimationDefault: 13.33,
  estimationByRole: {
    Developer: 13.33,
    "QA Engineer": 13.33,
    Analyst: 13.34
  }
};

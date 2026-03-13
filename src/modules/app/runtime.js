import { createDefaultState } from "../models.js";

export const refs = {};

export const runtime = {
  appState: createDefaultState(),
  pendingDeleteAction: null,
  pendingBulkWorkingDaysPeriodId: null,
  pendingBulkRowEstimationPeriodId: null
};

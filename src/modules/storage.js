import { createDefaultState } from "./models.js";

const STORAGE_KEY = "jiraPlanningMvpStateV1";

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

function readFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }
    return { ...createDefaultState(), ...JSON.parse(raw) };
  } catch (error) {
    console.error("Failed to read local state:", error);
    return createDefaultState();
  }
}

function writeToLocalStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadState() {
  if (!hasChromeStorage()) {
    return readFromLocalStorage();
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const loaded = result?.[STORAGE_KEY];
      if (!loaded) {
        resolve(createDefaultState());
        return;
      }
      resolve({ ...createDefaultState(), ...loaded });
    });
  });
}

export async function saveState(state) {
  if (!hasChromeStorage()) {
    writeToLocalStorage(state);
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => resolve());
  });
}

export async function withState(updater) {
  const current = await loadState();
  const updated = updater(current);
  await saveState(updated);
  return updated;
}

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../../types";
import {
  getCodexUnifiedExecExternalStatus,
  readGlobalCodexAuthJson,
  readGlobalCodexConfigToml,
  restoreCodexUnifiedExecOfficialDefault,
  setCodexUnifiedExecOfficialOverride,
} from "../../../services/tauri";
import { ask } from "@tauri-apps/plugin-dialog";
import { VendorSettingsPanel } from "./VendorSettingsPanel";

const mockState = vi.hoisted(() => ({
  claudeManagement: {
    currentConfig: null,
    currentConfigLoading: false,
    providers: [],
    loading: false,
    handleSwitchProvider: vi.fn(),
    handleAddProvider: vi.fn(),
    handleEditProvider: vi.fn(),
    handleDeleteProvider: vi.fn(),
    providerDialog: { isOpen: false, provider: null },
    handleCloseProviderDialog: vi.fn(),
    handleSaveProvider: vi.fn(),
    deleteConfirm: { isOpen: false, provider: null },
    confirmDeleteProvider: vi.fn(),
    cancelDeleteProvider: vi.fn(),
  },
  codexManagement: {
    codexProviderError: null,
    codexProviders: [],
    codexLoading: false,
    handleAddCodexProvider: vi.fn(),
    handleEditCodexProvider: vi.fn(),
    handleDeleteCodexProvider: vi.fn(),
    handleSwitchCodexProvider: vi.fn(),
    codexProviderDialog: { isOpen: false, provider: null },
    handleCloseCodexProviderDialog: vi.fn(),
    handleSaveCodexProvider: vi.fn(),
    deleteCodexConfirm: { isOpen: false, provider: null },
    confirmDeleteCodexProvider: vi.fn(),
    cancelDeleteCodexProvider: vi.fn(),
  },
  claudeModels: { models: [], updateModels: vi.fn() },
  codexModels: { models: [], updateModels: vi.fn() },
  geminiModels: { models: [], updateModels: vi.fn() },
}));

vi.mock("../hooks/useProviderManagement", () => ({
  useProviderManagement: vi.fn(() => mockState.claudeManagement),
}));

vi.mock("../hooks/useCodexProviderManagement", () => ({
  useCodexProviderManagement: vi.fn(() => mockState.codexManagement),
}));

vi.mock("../hooks/usePluginModels", () => ({
  usePluginModels: vi.fn((key: string) => {
    if (key === "codex-custom-models") {
      return mockState.codexModels;
    }
    if (key === "gemini-custom-models") {
      return mockState.geminiModels;
    }
    return mockState.claudeModels;
  }),
}));

vi.mock("../modelManagerRequest", () => ({
  consumeVendorModelManagerRequest: vi.fn(() => null),
  VENDOR_MODEL_MANAGER_REQUEST_EVENT: "vendor-model-manager-request",
}));

vi.mock("./ProviderList", () => ({
  ProviderList: () => <div data-testid="provider-list-stub" />,
}));

vi.mock("./CodexProviderList", () => ({
  CodexProviderList: () => <div data-testid="codex-provider-list-stub" />,
}));

vi.mock("./ProviderDialog", () => ({
  ProviderDialog: () => null,
}));

vi.mock("./CodexProviderDialog", () => ({
  CodexProviderDialog: () => null,
}));

vi.mock("./DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: () => null,
}));

vi.mock("./CustomModelDialog", () => ({
  CustomModelDialog: () => null,
}));

vi.mock("./CurrentClaudeConfigCard", () => ({
  CurrentClaudeConfigCard: () => <div data-testid="current-claude-config-stub" />,
}));

vi.mock("./CurrentCodexGlobalConfigCard", () => ({
  CurrentCodexGlobalConfigCard: () => <div data-testid="current-codex-config-stub" />,
}));

vi.mock("./GeminiVendorPanel", () => ({
  GeminiVendorPanel: () => <div data-testid="gemini-vendor-panel-stub" />,
}));

vi.mock("../../../services/tauri", async () => {
  const actual = await vi.importActual<typeof import("../../../services/tauri")>(
    "../../../services/tauri",
  );
  return {
    ...actual,
    readGlobalCodexConfigToml: vi.fn(),
    readGlobalCodexAuthJson: vi.fn(),
    getCodexUnifiedExecExternalStatus: vi.fn(),
    restoreCodexUnifiedExecOfficialDefault: vi.fn(),
    setCodexUnifiedExecOfficialOverride: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  open: vi.fn(),
}));

const readGlobalCodexConfigTomlMock = vi.mocked(readGlobalCodexConfigToml);
const readGlobalCodexAuthJsonMock = vi.mocked(readGlobalCodexAuthJson);
const getCodexUnifiedExecExternalStatusMock = vi.mocked(
  getCodexUnifiedExecExternalStatus,
);
const restoreCodexUnifiedExecOfficialDefaultMock = vi.mocked(
  restoreCodexUnifiedExecOfficialDefault,
);
const setCodexUnifiedExecOfficialOverrideMock = vi.mocked(
  setCodexUnifiedExecOfficialOverride,
);
const askMock = vi.mocked(ask);

const baseSettings = {
  codexUnifiedExecPolicy: "inherit",
  experimentalUnifiedExecEnabled: undefined,
} as AppSettings;

function renderPanel(
  options: {
    appSettings?: AppSettings;
    onUpdateAppSettings?: (settings: AppSettings) => Promise<void>;
    handleReloadCodexRuntimeConfig?: () => Promise<void>;
    codexReloadStatus?: "idle" | "reloading" | "applied" | "failed";
    codexReloadMessage?: string | null;
  } = {},
) {
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const handleReloadCodexRuntimeConfig =
    options.handleReloadCodexRuntimeConfig ?? vi.fn().mockResolvedValue(undefined);

  render(
    <VendorSettingsPanel
      appSettings={options.appSettings ?? baseSettings}
      codexReloadStatus={options.codexReloadStatus ?? "idle"}
      codexReloadMessage={options.codexReloadMessage ?? null}
      handleReloadCodexRuntimeConfig={handleReloadCodexRuntimeConfig}
      onUpdateAppSettings={onUpdateAppSettings}
    />,
  );

  return {
    handleReloadCodexRuntimeConfig,
    onUpdateAppSettings,
  };
}

async function openCodexTab() {
  fireEvent.click(screen.getByText("Codex"));
  await waitFor(() => {
    expect(getCodexUnifiedExecExternalStatusMock).toHaveBeenCalled();
  });
}

beforeEach(() => {
  readGlobalCodexConfigTomlMock.mockResolvedValue({
    exists: true,
    content: "[features]\n",
    truncated: false,
  });
  readGlobalCodexAuthJsonMock.mockResolvedValue({
    exists: true,
    content: "{\"access_token\":\"***\"}",
    truncated: false,
  });
  getCodexUnifiedExecExternalStatusMock.mockResolvedValue({
    configPath: "/tmp/codex/config.toml",
    hasExplicitUnifiedExec: false,
    explicitUnifiedExecValue: null,
    officialDefaultEnabled: true,
  });
  restoreCodexUnifiedExecOfficialDefaultMock.mockResolvedValue({
    configPath: "/tmp/codex/config.toml",
    hasExplicitUnifiedExec: false,
    explicitUnifiedExecValue: null,
    officialDefaultEnabled: true,
  });
  setCodexUnifiedExecOfficialOverrideMock.mockResolvedValue({
    configPath: "/tmp/codex/config.toml",
    hasExplicitUnifiedExec: true,
    explicitUnifiedExecValue: true,
    officialDefaultEnabled: true,
  });
  askMock.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VendorSettingsPanel", () => {
  it("shows background terminal in the Codex tab with readable policy labels", async () => {
    renderPanel({
      appSettings: {
        ...baseSettings,
        codexUnifiedExecPolicy: "forceEnabled",
      } as AppSettings,
    });

    await openCodexTab();

    expect(screen.getByText("Background terminal")).toBeTruthy();
    expect(screen.getByText("Official config")).toBeTruthy();
    expect(screen.getByText("Always enable")).toBeTruthy();
    expect(screen.queryByText("forceEnabled")).toBeNull();
    expect(
      screen.getByText("Official default on this platform: enabled."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Background terminal" }));
    const forceEnableOption = await screen.findByRole("option", {
      name: "Always enable",
    });
    expect(forceEnableOption).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Follow official default" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Always disable" }),
    ).toBeTruthy();
  });

  it("shows legacy override repair actions in the Codex tab and restores on confirm", async () => {
    getCodexUnifiedExecExternalStatusMock.mockResolvedValue({
      configPath: "/tmp/codex/config.toml",
      hasExplicitUnifiedExec: true,
      explicitUnifiedExecValue: false,
      officialDefaultEnabled: true,
    });
    restoreCodexUnifiedExecOfficialDefaultMock.mockResolvedValue({
      configPath: "/tmp/codex/config.toml",
      hasExplicitUnifiedExec: false,
      explicitUnifiedExecValue: null,
      officialDefaultEnabled: true,
    });

    renderPanel();
    await openCodexTab();

    expect(screen.getByText("Legacy override detected")).toBeTruthy();
    expect(
      screen.getByText(
        "A previous version wrote unified_exec = disabled to the official CODEX_HOME/config.toml. Restore official default to remove that override.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore official default" }));

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledTimes(1);
      expect(restoreCodexUnifiedExecOfficialDefaultMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(
        "Restored the official unified_exec default and reloaded connected inherit Codex sessions.",
      ),
    ).toBeTruthy();
  });

  it("writes official unified_exec and reloads inherit sessions", async () => {
    const handleReloadCodexRuntimeConfig = vi.fn().mockResolvedValue(undefined);
    setCodexUnifiedExecOfficialOverrideMock.mockResolvedValue({
      configPath: "/tmp/codex/config.toml",
      hasExplicitUnifiedExec: true,
      explicitUnifiedExecValue: true,
      officialDefaultEnabled: true,
    });

    renderPanel({ handleReloadCodexRuntimeConfig });
    await openCodexTab();

    fireEvent.click(screen.getByRole("button", { name: "Write official enabled" }));

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledTimes(1);
      expect(setCodexUnifiedExecOfficialOverrideMock).toHaveBeenCalledWith(true);
      expect(handleReloadCodexRuntimeConfig).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(
        "Wrote official unified_exec = enabled and reloaded connected inherit Codex sessions.",
      ),
    ).toBeTruthy();
  });

  it("does not write official unified_exec when the confirm dialog is cancelled", async () => {
    askMock.mockResolvedValue(false);

    const handleReloadCodexRuntimeConfig = vi.fn().mockResolvedValue(undefined);
    renderPanel({ handleReloadCodexRuntimeConfig });
    await openCodexTab();

    fireEvent.click(screen.getByRole("button", { name: "Write official enabled" }));

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledTimes(1);
    });
    expect(setCodexUnifiedExecOfficialOverrideMock).not.toHaveBeenCalled();
    expect(handleReloadCodexRuntimeConfig).not.toHaveBeenCalled();
  });

  it("refreshes Codex config content and unified_exec status after reload", async () => {
    const { handleReloadCodexRuntimeConfig } = renderPanel();

    await openCodexTab();

    const initialConfigReads = readGlobalCodexConfigTomlMock.mock.calls.length;
    const initialAuthReads = readGlobalCodexAuthJsonMock.mock.calls.length;
    const initialStatusReads = getCodexUnifiedExecExternalStatusMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "settings.codexRuntimeReload" }));

    await waitFor(() => {
      expect(handleReloadCodexRuntimeConfig).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(readGlobalCodexConfigTomlMock.mock.calls.length).toBeGreaterThan(
        initialConfigReads,
      );
      expect(readGlobalCodexAuthJsonMock.mock.calls.length).toBeGreaterThan(
        initialAuthReads,
      );
      expect(getCodexUnifiedExecExternalStatusMock.mock.calls.length).toBeGreaterThan(
        initialStatusReads,
      );
    });
  });
});

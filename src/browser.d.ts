// @ts-check
/**
 * Ambient declarations for browser APIs TypeScript's DOM library does not
 * describe yet, plus the small surface nav.js exposes.
 *
 * These are types, not polyfills. `src/app.js` still feature-detects every one
 * of them at runtime — File System Access is Chromium-only, and
 * FileSystemObserver is newer still.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DataTransferItem {
  /** Chromium: yields a real file handle from a drop, so it can be watched. */
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

interface OpenFilePickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Global emitted ahead of nav.js in the built app. */
declare function fitMetricValuesAfterFonts(slides: Iterable<Element>): void;

interface Window {
  showOpenFilePicker?(o?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  /** Change notification without polling. Newer than File System Access itself. */
  FileSystemObserver?: {
    new (cb: (records: unknown[], observer: unknown) => void): {
      observe(handle: FileSystemHandle): Promise<void>;
      disconnect(): void;
    };
  };
  /**
   * Presentation controller, defined by nav.js. The app calls refresh() after
   * every render; current() lets it preserve the reader's position.
   */
  quireNav: {
    refresh(keepIndex?: number): void;
    sync(): void;
    current(): number;
    go(index: number): void;
  };
  /**
   * Overflow reporting, defined by app.js from src/fit.js. Exposed as a global
   * so a deck's fit can be asserted on from a driving script instead of being
   * judged from a screenshot.
   */
  quireFit: {
    report(): import('./fit.js').SlideFit[];
    overflowing(): import('./fit.js').SlideFit[];
    format(): string;
    remeasure(): import('./fit.js').SlideFit[];
  };
  /**
   * The shell template, embedded at build time so the app can produce a
   * single-file runtime and source export offline. Absent when running the modules unbuilt,
   * which is why export.js checks for it rather than assuming.
   */
  quireShell?: string;
  quireMetricSource?: string;
  /**
   * Export, defined by app.js from src/export.js. A global for the same
   * reason as quireFit: it makes the result assertable rather than something
   * a person has to open and look at.
   */
  quireExport: {
    html(): string;
    name(): string;
    save(): void;
  };
}

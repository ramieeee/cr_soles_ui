"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type SnackbarVariant = "success" | "error";

type SnackbarItem = {
  id: number;
  message: string;
  variant: SnackbarVariant;
};

type SnackbarContextValue = {
  showSnackbar: (message: string, variant?: SnackbarVariant) => void;
};

const AUTO_DISMISS_MS = 4000;

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const VARIANT_STYLES: Record<SnackbarVariant, { container: string; icon: string }> = {
  success: {
    container:
      "border-[#22c55e]/50 bg-[#052e16]/95 text-[#bbf7d0] shadow-[0_0_20px_rgba(34,197,94,0.15)]",
    icon: "check_circle",
  },
  error: {
    container:
      "border-[#ef4444]/50 bg-[#450a0a]/95 text-[#fecaca] shadow-[0_0_20px_rgba(239,68,68,0.15)]",
    icon: "error",
  },
};

export function SnackbarProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showSnackbar = useCallback(
    (message: string, variant: SnackbarVariant = "success") => {
      const id = nextIdRef.current++;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showSnackbar }), [showSnackbar]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {items.length
        ? createPortal(
            <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4">
              {items.map((item) => {
                const styles = VARIANT_STYLES[item.variant];
                return (
                  <div
                    key={item.id}
                    role="status"
                    className={`ui-pop pointer-events-auto flex w-full items-center gap-3 rounded-lg border px-4 py-3 backdrop-blur-sm ${styles.container}`}
                  >
                    <span className="material-symbols-outlined text-xl">
                      {styles.icon}
                    </span>
                    <p className="flex-1 break-words text-sm leading-5">
                      {item.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      aria-label="Dismiss notification"
                      className="material-symbols-outlined text-base opacity-60 transition-opacity hover:opacity-100"
                    >
                      close
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used inside SnackbarProvider");
  }
  return context;
};

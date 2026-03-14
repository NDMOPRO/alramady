import React, { createContext, useContext, useState, useCallback } from "react";
import { type DesignConfig, getDesign, LIGHT_COLORS, DARK_COLORS } from "@/lib/designs";
import { useTheme } from "@/contexts/ThemeContext";

interface DesignContextType {
  currentDesign: DesignConfig;
  setDesignId: (id: number) => void;
  colors: typeof LIGHT_COLORS;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

const DesignContext = createContext<DesignContextType | undefined>(undefined);

interface DesignProviderProps {
  children: React.ReactNode;
  defaultDesignId?: number;
}

export function DesignProvider({
  children,
  defaultDesignId = 1,
}: DesignProviderProps) {
  const { theme } = useTheme();
  const [designId, setDesignId] = useState(() => {
    const stored = localStorage.getItem("rasid-design-id");
    return stored ? parseInt(stored, 10) : defaultDesignId;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const currentDesign = getDesign(designId);
  const colors = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;

  const handleSetDesignId = useCallback((id: number) => {
    setDesignId(id);
    localStorage.setItem("rasid-design-id", String(id));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  return (
    <DesignContext.Provider
      value={{
        currentDesign,
        setDesignId: handleSetDesignId,
        colors,
        sidebarOpen,
        toggleSidebar,
        setSidebarOpen,
      }}
    >
      {children}
    </DesignContext.Provider>
  );
}

export function useDesign() {
  const context = useContext(DesignContext);
  if (!context) {
    throw new Error("useDesign must be used within DesignProvider");
  }
  return context;
}

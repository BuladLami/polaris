import {
  Compass,
  Crosshair,
  Database,
  HelpCircle,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Theme } from "@/hooks/use-theme";
import type { AppMode } from "@/types/polaris";

export interface AppHeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenScoreGuide: () => void;
  onOpenDatasetInfo: () => void;
  onRefresh: () => void;
  onGoHome: () => void;
  refreshing: boolean;
  loadedAt: Date | null;
  theme: Theme;
  onToggleTheme: () => void;
}

const MODES: { id: AppMode; label: string; icon: typeof Compass; hint: string }[] =
  [
    {
      id: "recommendation",
      label: "Recommend",
      icon: Compass,
      hint: "Search an area and get the best sites inside it.",
    },
    {
      id: "evaluation",
      label: "Evaluate",
      icon: Crosshair,
      hint: "Read the suitability score for one specific location.",
    },
  ];

export function AppHeader({
  mode,
  onModeChange,
  onOpenScoreGuide,
  onOpenDatasetInfo,
  onRefresh,
  onGoHome,
  refreshing,
  loadedAt,
  theme,
  onToggleTheme,
}: AppHeaderProps) {
  return (
    <header className="bg-card/80 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-3 backdrop-blur-md sm:px-4">
      {/* Brand — doubles as the home link, the way a site logo normally does. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onGoHome}
            className={cn(
              "-mx-1.5 flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors",
              "hover:bg-accent/60 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
            )}
          >
            <img
              src="/logo-256.png"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/10"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold tracking-tight">
                POLARIS
              </p>
              <p className="text-muted-foreground hidden truncate text-[10px] sm:block">
                Health facility siting · Talomo District
              </p>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Back to the start — this clears your current search
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="hidden h-7 sm:block" />

      {/* Mode switch */}
      <nav
        className="bg-muted/70 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
        aria-label="Mode"
      >
        {MODES.map(({ id, label, icon: Icon, hint }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onModeChange(id)}
                aria-pressed={mode === id}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
                  mode === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Utilities */}
      <div className="flex shrink-0 items-center gap-1">
        <HeaderAction
          icon={<HelpCircle className="size-4" />}
          label="What the scores mean"
          onClick={onOpenScoreGuide}
          emphasised
        />
        <HeaderAction
          icon={<Database className="size-4" />}
          label="Where the data comes from"
          onClick={onOpenDatasetInfo}
        />
        <HeaderAction
          icon={
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          }
          label={
            loadedAt
              ? `Reload the data (last loaded ${loadedAt.toLocaleTimeString()})`
              : "Reload the data"
          }
          onClick={onRefresh}
          disabled={refreshing}
        />
        <HeaderAction
          icon={
            theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />
          }
          label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          onClick={onToggleTheme}
        />
      </div>
    </header>
  );
}

function HeaderAction({
  icon,
  label,
  onClick,
  disabled,
  emphasised,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasised?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={emphasised ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

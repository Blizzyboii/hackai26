"use client";

import { PathCandidate, RiskTolerance, ScenarioAnalysis, StudentProfile } from "./types";

interface CompanyOption {
  id: string;
  label: string;
}

interface ClubOption {
  id: string;
  label: string;
}

interface ActivityOption {
  id: string;
  label: string;
  type: "club" | "subprogram";
}

interface CompanyOutlook {
  companyId: string;
  label: string;
  confidence: number | null;
  hasRoute: boolean;
}

interface ControlRailProps {
  filters: {
    targetCompany: string | null;
    includeTags: string[];
    excludeTags: string[];
    eliminatedClubIds: string[];
    focusMode: boolean;
    showFullTree: boolean;
    includeClubBridges: boolean;
  };
  profile: StudentProfile;
  tags: string[];
  clubs: ClubOption[];
  activities: ActivityOption[];
  companies: CompanyOption[];
  companyOutlook: CompanyOutlook[];
  primaryPath: PathCandidate | null;
  secondaryPaths: PathCandidate[];
  pathDescriptions: Record<string, string>;
  activePathId: string | null;
  scenarioAnalysis: ScenarioAnalysis | null;
  scenarioClubOptions: ClubOption[];
  selectedScenarioClubId: string | null;
  noRouteReason: string | null;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onTargetCompaniesChange: (companyIds: string[]) => void;
  onActiveTargetChange: (targetId: string | null) => void;
  onGraduationTermChange: (term: StudentProfile["graduationTerm"]) => void;
  onGraduationYearChange: (year: number) => void;
  onSemestersRemainingChange: (value: number) => void;
  onCompletedNodesChange: (nodeIds: string[]) => void;
  onCompletedCourseCountChange: (value: number) => void;
  onCompletedResearchCountChange: (value: number) => void;
  onCompletedExtracurricularCountChange: (value: number) => void;
  onRiskToleranceChange: (risk: RiskTolerance) => void;
  onIncludeTagsChange: (tags: string[]) => void;
  onExcludeTagsChange: (tags: string[]) => void;
  onToggleEliminatedClub: (clubId: string) => void;
  onSelectPath: (pathId: string | null) => void;
  onScenarioClubChange: (clubId: string | null) => void;
  onToggleFocusMode: () => void;
  onToggleShowFullTree: () => void;
  onToggleClubBridges: () => void;
  onClearFilters: () => void;
}

function scorePercent(value: number) {
  return Math.round(value * 100);
}

/* ── Score Bar ── */

function ScoreBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "emerald";
}) {
  const gradients = {
    cyan: "from-cyan-500 to-cyan-400",
    amber: "from-amber-500 to-amber-400",
    emerald: "from-emerald-500 to-emerald-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span>{label}</span>
        <span className="text-slate-300">{scorePercent(value)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradients[tone]} transition-all duration-500 ease-out`}
          style={{ width: `${scorePercent(value)}%` }}
        />
      </div>
    </div>
  );
}

/* ── Toggle Row ── */

function ToggleRow({
  label,
  description,
  checked,
  onClick,
}: {
  label: string;
  description: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 text-left backdrop-blur-sm transition-colors hover:bg-slate-800/50"
      onClick={onClick}
    >
      <div>
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
      <span
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-200 ${checked ? "bg-cyan-500" : "bg-slate-600"}`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

/* ── Risk Toggle ── */

function RiskToggle({
  value,
  active,
  onClick,
}: {
  value: RiskTolerance;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${active
        ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
        : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/60"
        }`}
      onClick={onClick}
    >
      {value}
    </button>
  );
}

/* ── Path Insight Card ── */

function PathInsightCard({
  title,
  path,
  description,
  active,
  onClick,
}: {
  title: string;
  path: PathCandidate;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${active
        ? "border-cyan-400/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/5"
        : "border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/50"
        }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            {title}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-200">
            {description}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-slate-100">
            {scorePercent(path.scoreBreakdown.overall)}
            <span className="text-xs font-medium text-slate-500">%</span>
          </p>
          <p className="text-[10px] text-slate-500">
            {scorePercent(path.confidence)} conf
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <ScoreBar
          label="Direct evidence"
          value={path.scoreBreakdown.directEvidence}
          tone="cyan"
        />
        <ScoreBar
          label="Transferability"
          value={path.scoreBreakdown.transferability}
          tone="amber"
        />
        <ScoreBar label="Fit" value={path.scoreBreakdown.fit} tone="emerald" />
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-xs text-slate-300">{path.explanations.summary}</p>
        <p className="text-[11px] text-slate-500">{path.explanations.directEvidence}</p>
      </div>
    </button>
  );
}

/* ── Scenario Delta Row ── */

function ScenarioDeltaRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const isPositive = value > 0;
  const isNeutral = value === 0;

  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/40 px-2.5 py-1.5 text-xs">
      <span className="text-slate-400">{label}</span>
      <span
        className={`font-bold ${isNeutral
          ? "text-slate-400"
          : isPositive
            ? "text-emerald-400"
            : "text-rose-400"
          }`}
      >
        {isPositive ? "+" : ""}
        {scorePercent(value)}%
      </span>
    </div>
  );
}

/* ── Section Header ── */

function SectionHeader({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <p
      className={`text-[10px] font-bold uppercase tracking-[0.14em] ${accent ? "text-cyan-300" : "text-slate-500"
        }`}
    >
      {label}
    </p>
  );
}

/* ── Chip Selector (replaces raw multi-select) ── */

function ChipSelector({
  options,
  selected,
  onChange,
  variant = "default",
  maxHeight,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  variant?: "default" | "danger";
  maxHeight?: string;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div
      className={`flex flex-wrap gap-1.5 ${maxHeight ? "custom-scrollbar overflow-y-auto pr-1" : ""}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {options.map((option) => {
        const isActive = selected.includes(option.id);

        return (
          <button
            key={option.id}
            type="button"
            className={`chip-base ${isActive
              ? variant === "danger"
                ? "chip-danger"
                : "chip-active"
              : "chip-inactive"
              }`}
            onClick={() => toggle(option.id)}
          >
            {option.label}
            {isActive ? (
              <span className="ml-0.5 text-[10px] opacity-70">×</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Main Rail Content ── */

function RailContent({
  filters,
  profile,
  tags,
  clubs,
  activities,
  companies,
  companyOutlook,
  primaryPath,
  secondaryPaths,
  pathDescriptions,
  activePathId,
  scenarioAnalysis,
  scenarioClubOptions,
  selectedScenarioClubId,
  noRouteReason,
  onTargetCompaniesChange,
  onActiveTargetChange,
  onGraduationTermChange,
  onGraduationYearChange,
  onSemestersRemainingChange,
  onCompletedNodesChange,
  onCompletedCourseCountChange,
  onCompletedResearchCountChange,
  onCompletedExtracurricularCountChange,
  onRiskToleranceChange,
  onIncludeTagsChange,
  onExcludeTagsChange,
  onToggleEliminatedClub,
  onSelectPath,
  onScenarioClubChange,
  onToggleFocusMode,
  onToggleShowFullTree,
  onToggleClubBridges,
  onClearFilters,
}: Omit<ControlRailProps, "mobileOpen" | "onMobileOpenChange">) {

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="border-b border-slate-700/40 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Career Analysis
        </p>
        <h1 className="mt-0.5 text-lg font-bold text-slate-100">
          Path Explorer
        </h1>
      </div>

      {/* ── Scrollable content ── */}
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {/* ── Target Companies (Chips) ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <SectionHeader label="Target companies" accent />

          <div className="mt-2.5">
            <ChipSelector
              options={companies}
              selected={profile.targetCompanies}
              onChange={onTargetCompaniesChange}
              maxHeight="140px"
            />
          </div>

          {profile.targetCompanies.length > 1 ? (
            <>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Active target
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {companies
                  .filter((c) => profile.targetCompanies.includes(c.id))
                  .map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className={`chip-base ${profile.activeTargetCompany === company.id
                        ? "bg-gradient-to-r from-cyan-500 to-cyan-600 border-cyan-400/50 text-slate-950 font-bold"
                        : "chip-inactive"
                        }`}
                      onClick={() => onActiveTargetChange(company.id)}
                    >
                      {company.label}
                    </button>
                  ))}
              </div>
            </>
          ) : null}
        </section>

        {/* ── Interest Tags (Chips) ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <SectionHeader label="Interest filters" />

          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Include tags
          </p>
          <div className="mt-1.5">
            <ChipSelector
              options={tags.map((t) => ({ id: t, label: t }))}
              selected={filters.includeTags}
              onChange={(newTags) =>
                onIncludeTagsChange(
                  newTags.filter((t) => !filters.excludeTags.includes(t)),
                )
              }
              maxHeight="120px"
            />
          </div>

          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Exclude tags
          </p>
          <div className="mt-1.5">
            <ChipSelector
              options={tags.map((t) => ({ id: t, label: t }))}
              selected={filters.excludeTags}
              onChange={(newTags) =>
                onExcludeTagsChange(
                  newTags.filter((t) => !filters.includeTags.includes(t)),
                )
              }
              variant="danger"
              maxHeight="120px"
            />
          </div>
        </section>

        {/* ── Excluded Clubs ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <SectionHeader label="Excluded clubs" />
            <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] font-bold text-slate-400">
              {filters.eliminatedClubIds.length}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {filters.eliminatedClubIds.length > 0 ? (
              filters.eliminatedClubIds.map((clubId) => {
                const clubLabel =
                  clubs.find((club) => club.id === clubId)?.label ?? clubId;

                return (
                  <button
                    key={clubId}
                    type="button"
                    className="chip-base chip-danger"
                    onClick={() => onToggleEliminatedClub(clubId)}
                  >
                    {clubLabel}
                    <span className="ml-0.5 text-[10px]">×</span>
                  </button>
                );
              })
            ) : (
              <p className="text-[11px] text-slate-500">
                No clubs excluded
              </p>
            )}
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 hover:text-slate-400">
              Manage clubs
            </summary>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {clubs.map((club) => {
                const isExcluded = filters.eliminatedClubIds.includes(club.id);

                return (
                  <button
                    key={club.id}
                    type="button"
                    className={`chip-base ${isExcluded ? "chip-danger" : "chip-inactive"}`}
                    onClick={() => onToggleEliminatedClub(club.id)}
                  >
                    {club.label}
                  </button>
                );
              })}
            </div>
          </details>
        </section>

        {/* ── Strongest Path ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <SectionHeader label="Strongest path" accent />
          <div className="mt-2.5 space-y-2">
            {primaryPath ? (
              <>
                <PathInsightCard
                  title="Recommended"
                  path={primaryPath}
                  description={pathDescriptions[primaryPath.id] ?? ""}
                  active={activePathId === primaryPath.id}
                  onClick={() => onSelectPath(primaryPath.id)}
                />
                <button
                  type="button"
                  className="w-full rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-800/50 hover:text-slate-200"
                  onClick={() => onSelectPath(null)}
                >
                  Clear selection
                </button>
              </>
            ) : (
              <p className="text-xs text-rose-400/80">
                {noRouteReason ?? "No route yet."}
              </p>
            )}
          </div>
        </section>

        {/* ── What-if Scenario ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <SectionHeader label="What changes if..." />
            {selectedScenarioClubId ? (
              <button
                type="button"
                className="text-[10px] font-bold text-slate-400 hover:text-slate-200"
                onClick={() => onScenarioClubChange(null)}
              >
                Clear
              </button>
            ) : null}
          </div>

          {scenarioClubOptions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scenarioClubOptions.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  className={`chip-base ${selectedScenarioClubId === club.id
                    ? "chip-active"
                    : "chip-inactive"
                    }`}
                  onClick={() =>
                    onScenarioClubChange(
                      selectedScenarioClubId === club.id ? null : club.id,
                    )
                  }
                >
                  {club.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              Select a route to compare exclusions.
            </p>
          )}

          {selectedScenarioClubId && scenarioAnalysis ? (
            <div className="mt-3 space-y-1.5 rounded-xl border border-slate-700/30 bg-slate-800/30 p-3">
              <p className="text-xs text-slate-300">
                {scenarioAnalysis.summary}
              </p>
              <ScenarioDeltaRow
                label="Overall"
                value={scenarioAnalysis.scoreDelta.overall}
              />
              <ScenarioDeltaRow
                label="Direct evidence"
                value={scenarioAnalysis.scoreDelta.directEvidence}
              />
              <ScenarioDeltaRow
                label="Transferability"
                value={scenarioAnalysis.scoreDelta.transferability}
              />
              <ScenarioDeltaRow
                label="Fit"
                value={scenarioAnalysis.scoreDelta.fit}
              />
            </div>
          ) : null}
        </section>

        {/* ── Backup Paths ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <SectionHeader label="Backup paths" />
          <div className="mt-2.5 space-y-2">
            {secondaryPaths.length > 0 ? (
              secondaryPaths.map((path, index) => (
                <PathInsightCard
                  key={path.id}
                  title={`Backup ${index + 1}`}
                  path={path}
                  description={pathDescriptions[path.id] ?? ""}
                  active={activePathId === path.id}
                  onClick={() => onSelectPath(path.id)}
                />
              ))
            ) : (
              <p className="text-[11px] text-slate-500">
                No backup paths under current filters.
              </p>
            )}
          </div>
        </section>

        {/* ── Target Outlook ── */}
        <section className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <SectionHeader label="Target outlook" />
          <div className="mt-2 space-y-1.5">
            {companyOutlook.length > 0 ? (
              companyOutlook.map((item) => (
                <div
                  key={item.companyId}
                  className="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2"
                >
                  <p className="text-xs font-medium text-slate-300">
                    {item.label}
                  </p>
                  <div className="flex items-center gap-2">
                    {item.hasRoute && item.confidence !== null ? (
                      <>
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-700/60">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                            style={{
                              width: `${Math.round(item.confidence * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-cyan-300">
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] font-semibold text-rose-400/80">
                        No route
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-500">
                Add targets to compare outcomes.
              </p>
            )}
          </div>
        </section>

        {/* ── Advanced Profile ── */}
        <details className="rounded-2xl border border-slate-700/30 bg-slate-800/20 p-3.5 backdrop-blur-sm">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-400">
            Advanced profile
          </summary>

          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                  htmlFor="graduation-term"
                >
                  Term
                </label>
                <select
                  id="graduation-term"
                  className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-800/50 px-2.5 py-2 text-sm text-slate-200"
                  value={profile.graduationTerm}
                  onChange={(event) =>
                    onGraduationTermChange(
                      event.target.value as StudentProfile["graduationTerm"],
                    )
                  }
                >
                  <option value="Spring">Spring</option>
                  <option value="Summer">Summer</option>
                  <option value="Fall">Fall</option>
                </select>
              </div>
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                  htmlFor="graduation-year"
                >
                  Year
                </label>
                <input
                  id="graduation-year"
                  type="number"
                  min={2026}
                  max={2035}
                  className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-800/50 px-2.5 py-2 text-sm text-slate-200"
                  value={profile.graduationYear}
                  onChange={(event) =>
                    onGraduationYearChange(Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                htmlFor="semesters-remaining"
              >
                Semesters remaining: {profile.semestersRemaining}
              </label>
              <input
                id="semesters-remaining"
                type="range"
                min={1}
                max={10}
                value={profile.semestersRemaining}
                className="mt-1 w-full accent-cyan-500"
                onChange={(event) =>
                  onSemestersRemainingChange(Number(event.target.value))
                }
              />
            </div>

            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500"
                htmlFor="completed-activities"
              >
                Completed activities
              </label>
              <div className="mt-1.5">
                <ChipSelector
                  options={activities.map((a) => ({
                    id: a.id,
                    label: a.label,
                  }))}
                  selected={profile.completedNodeIds}
                  onChange={onCompletedNodesChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                  htmlFor="course-count"
                >
                  Courses
                </label>
                <input
                  id="course-count"
                  type="number"
                  min={0}
                  max={40}
                  className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-200"
                  value={profile.completedCourseCount}
                  onChange={(event) =>
                    onCompletedCourseCountChange(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                  htmlFor="research-count"
                >
                  Research
                </label>
                <input
                  id="research-count"
                  type="number"
                  min={0}
                  max={10}
                  className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-200"
                  value={profile.completedResearchCount}
                  onChange={(event) =>
                    onCompletedResearchCountChange(Number(event.target.value))
                  }
                />
              </div>
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"
                  htmlFor="extra-count"
                >
                  Extras
                </label>
                <input
                  id="extra-count"
                  type="number"
                  min={0}
                  max={20}
                  className="mt-1 w-full rounded-xl border border-slate-700/40 bg-slate-800/50 px-2 py-1.5 text-xs text-slate-200"
                  value={profile.completedExtracurricularCount}
                  onChange={(event) =>
                    onCompletedExtracurricularCountChange(
                      Number(event.target.value),
                    )
                  }
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                Risk tolerance
              </p>
              <div className="mt-1.5 flex gap-2">
                <RiskToggle
                  value="low"
                  active={profile.riskTolerance === "low"}
                  onClick={() => onRiskToleranceChange("low")}
                />
                <RiskToggle
                  value="medium"
                  active={profile.riskTolerance === "medium"}
                  onClick={() => onRiskToleranceChange("medium")}
                />
                <RiskToggle
                  value="high"
                  active={profile.riskTolerance === "high"}
                  onClick={() => onRiskToleranceChange("high")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <ToggleRow
                label="Focus mode"
                description="Dim unrelated nodes and emphasize relevant paths."
                checked={filters.focusMode}
                onClick={onToggleFocusMode}
              />
              <ToggleRow
                label="Show full tree"
                description="Clear dimming and inspect the full club ecosystem."
                checked={filters.showFullTree}
                onClick={onToggleShowFullTree}
              />
              <ToggleRow
                label="Cross-club bridges"
                description="Allow lateral transitions between clubs."
                checked={filters.includeClubBridges}
                onClick={onToggleClubBridges}
              />
            </div>
          </div>
        </details>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-700/40 px-4 py-3">
        <button
          type="button"
          className="w-full rounded-xl border border-slate-600/40 bg-transparent px-3 py-2.5 text-sm font-bold text-slate-300 transition-all hover:border-slate-500/60 hover:bg-slate-800/40 hover:text-slate-100"
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}

export function ControlRail({
  filters,
  profile,
  tags,
  clubs,
  activities,
  companies,
  companyOutlook,
  primaryPath,
  secondaryPaths,
  pathDescriptions,
  activePathId,
  scenarioAnalysis,
  scenarioClubOptions,
  selectedScenarioClubId,
  noRouteReason,
  mobileOpen,
  onMobileOpenChange,
  onTargetCompaniesChange,
  onActiveTargetChange,
  onGraduationTermChange,
  onGraduationYearChange,
  onSemestersRemainingChange,
  onCompletedNodesChange,
  onCompletedCourseCountChange,
  onCompletedResearchCountChange,
  onCompletedExtracurricularCountChange,
  onRiskToleranceChange,
  onIncludeTagsChange,
  onExcludeTagsChange,
  onToggleEliminatedClub,
  onSelectPath,
  onScenarioClubChange,
  onToggleFocusMode,
  onToggleShowFullTree,
  onToggleClubBridges,
  onClearFilters,
}: ControlRailProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-full w-[360px] shrink-0 border-r border-slate-700/30 bg-slate-950/95 backdrop-blur-xl md:block">
        <RailContent
          filters={filters}
          profile={profile}
          tags={tags}
          clubs={clubs}
          activities={activities}
          companies={companies}
          companyOutlook={companyOutlook}
          primaryPath={primaryPath}
          secondaryPaths={secondaryPaths}
          pathDescriptions={pathDescriptions}
          activePathId={activePathId}
          scenarioAnalysis={scenarioAnalysis}
          scenarioClubOptions={scenarioClubOptions}
          selectedScenarioClubId={selectedScenarioClubId}
          noRouteReason={noRouteReason}
          onTargetCompaniesChange={onTargetCompaniesChange}
          onActiveTargetChange={onActiveTargetChange}
          onGraduationTermChange={onGraduationTermChange}
          onGraduationYearChange={onGraduationYearChange}
          onSemestersRemainingChange={onSemestersRemainingChange}
          onCompletedNodesChange={onCompletedNodesChange}
          onCompletedCourseCountChange={onCompletedCourseCountChange}
          onCompletedResearchCountChange={onCompletedResearchCountChange}
          onCompletedExtracurricularCountChange={onCompletedExtracurricularCountChange}
          onRiskToleranceChange={onRiskToleranceChange}
          onIncludeTagsChange={onIncludeTagsChange}
          onExcludeTagsChange={onExcludeTagsChange}
          onToggleEliminatedClub={onToggleEliminatedClub}
          onSelectPath={onSelectPath}
          onScenarioClubChange={onScenarioClubChange}
          onToggleFocusMode={onToggleFocusMode}
          onToggleShowFullTree={onToggleShowFullTree}
          onToggleClubBridges={onToggleClubBridges}
          onClearFilters={onClearFilters}
        />
      </aside>

      {/* Mobile trigger */}
      <button
        type="button"
        className="fixed bottom-4 left-4 z-40 rounded-2xl border border-slate-600/40 bg-slate-900/90 px-4 py-2.5 text-sm font-bold text-slate-100 shadow-xl backdrop-blur-md md:hidden"
        onClick={() => onMobileOpenChange(true)}
      >
        Analysis
      </button>

      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition duration-300 md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => onMobileOpenChange(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-x-0 bottom-0 z-50 h-[86dvh] transform rounded-t-3xl border-t border-slate-700/40 bg-slate-950/95 backdrop-blur-xl transition-transform duration-300 ease-out md:hidden ${mobileOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-center justify-between border-b border-slate-700/40 px-5 py-3.5">
          <p className="text-sm font-bold text-slate-100">Analysis</p>
          <button
            type="button"
            className="rounded-xl border border-slate-600/40 bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-200"
            onClick={() => onMobileOpenChange(false)}
          >
            Close
          </button>
        </div>

        <div className="h-[calc(86dvh-57px)] overflow-hidden">
          <RailContent
            filters={filters}
            profile={profile}
            tags={tags}
            clubs={clubs}
            activities={activities}
            companies={companies}
            companyOutlook={companyOutlook}
            primaryPath={primaryPath}
            secondaryPaths={secondaryPaths}
            pathDescriptions={pathDescriptions}
            activePathId={activePathId}
            scenarioAnalysis={scenarioAnalysis}
            scenarioClubOptions={scenarioClubOptions}
            selectedScenarioClubId={selectedScenarioClubId}
            noRouteReason={noRouteReason}
            onTargetCompaniesChange={onTargetCompaniesChange}
            onActiveTargetChange={onActiveTargetChange}
            onGraduationTermChange={onGraduationTermChange}
            onGraduationYearChange={onGraduationYearChange}
            onSemestersRemainingChange={onSemestersRemainingChange}
            onCompletedNodesChange={onCompletedNodesChange}
            onCompletedCourseCountChange={onCompletedCourseCountChange}
            onCompletedResearchCountChange={onCompletedResearchCountChange}
            onCompletedExtracurricularCountChange={onCompletedExtracurricularCountChange}
            onRiskToleranceChange={onRiskToleranceChange}
            onIncludeTagsChange={onIncludeTagsChange}
            onExcludeTagsChange={onExcludeTagsChange}
            onToggleEliminatedClub={onToggleEliminatedClub}
            onSelectPath={onSelectPath}
            onScenarioClubChange={onScenarioClubChange}
            onToggleFocusMode={onToggleFocusMode}
            onToggleShowFullTree={onToggleShowFullTree}
            onToggleClubBridges={onToggleClubBridges}
            onClearFilters={onClearFilters}
          />
        </div>
      </aside>
    </>
  );
}

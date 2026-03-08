"use client";

import { ChangeEvent } from "react";
import { PathCandidate, RiskTolerance, StudentProfile } from "./types";

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
  onToggleFocusMode: () => void;
  onToggleShowFullTree: () => void;
  onToggleClubBridges: () => void;
  onClearFilters: () => void;
}

function readMultiSelectValue(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions, (option) => option.value);
}

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
      className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-left hover:bg-[#171b26]"
      onClick={onClick}
    >
      <div>
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <span
        className={`mt-1 inline-flex h-5 w-9 rounded-full p-0.5 transition ${checked ? "bg-cyan-600" : "bg-slate-600"}`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

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
      className={`rounded-md px-2 py-1 text-xs font-semibold transition ${active ? "bg-cyan-500 text-slate-950" : "bg-[#11131c] text-slate-200 hover:bg-[#171b26]"}`}
      onClick={onClick}
    >
      {value}
    </button>
  );
}

function PathCard({
  label,
  path,
  description,
  active,
  onClick,
}: {
  label: string;
  path: PathCandidate;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg border px-3 py-2 text-left transition ${active ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-[#11131c] hover:bg-[#171b26]"}`}
      onClick={onClick}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-200">{label}</p>
      <p className="mt-1 text-xs text-slate-200">
        {Math.round(path.confidence * 100)}% confidence · Score {path.score.toFixed(2)}
      </p>
      <p className="mt-1 text-xs text-slate-400">Alumni {path.alumniWeight} · Extra hops {path.extraHops}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      {path.rationale.length > 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">{path.rationale[0]}</p>
      ) : null}
    </button>
  );
}

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
  onToggleFocusMode,
  onToggleShowFullTree,
  onToggleClubBridges,
  onClearFilters,
}: Omit<ControlRailProps, "mobileOpen" | "onMobileOpenChange">) {
  const eliminatedSet = new Set(filters.eliminatedClubIds);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-700 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Cortex controls</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-100">Career Path Explorer</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="rounded-lg border border-slate-700 bg-[#0f1118] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-200">Student profile simulation</p>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="target-companies">
            Target companies (multi)
          </label>
          <select
            id="target-companies"
            multiple
            size={Math.min(companies.length, 6)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-sm text-slate-100"
            value={profile.targetCompanies}
            onChange={(event) => onTargetCompaniesChange(readMultiSelectValue(event))}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.label}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="active-target">
            Active target focus
          </label>
          <select
            id="active-target"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-sm text-slate-100"
            value={profile.activeTargetCompany ?? ""}
            onChange={(event) => onActiveTargetChange(event.target.value || null)}
          >
            <option value="">Select active target</option>
            {companies
              .filter((company) => profile.targetCompanies.includes(company.id))
              .map((company) => (
                <option key={company.id} value={company.id}>
                  {company.label}
                </option>
              ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="graduation-term">
                Graduation term
              </label>
              <select
                id="graduation-term"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#11131c] px-2 py-2 text-sm text-slate-100"
                value={profile.graduationTerm}
                onChange={(event) => onGraduationTermChange(event.target.value as StudentProfile["graduationTerm"])}
              >
                <option value="Spring">Spring</option>
                <option value="Summer">Summer</option>
                <option value="Fall">Fall</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="graduation-year">
                Graduation year
              </label>
              <input
                id="graduation-year"
                type="number"
                min={2026}
                max={2035}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#11131c] px-2 py-2 text-sm text-slate-100"
                value={profile.graduationYear}
                onChange={(event) => onGraduationYearChange(Number(event.target.value))}
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="semesters-remaining">
            Semesters remaining: {profile.semestersRemaining}
          </label>
          <input
            id="semesters-remaining"
            type="range"
            min={1}
            max={10}
            value={profile.semestersRemaining}
            className="mt-1 w-full"
            onChange={(event) => onSemestersRemainingChange(Number(event.target.value))}
          />

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="completed-activities">
            Completed activities
          </label>
          <select
            id="completed-activities"
            multiple
            size={Math.min(activities.length, 6)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-sm text-slate-100"
            value={profile.completedNodeIds}
            onChange={(event) => onCompletedNodesChange(readMultiSelectValue(event))}
          >
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.label} ({activity.type})
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400" htmlFor="course-count">
                Courses
              </label>
              <input
                id="course-count"
                type="number"
                min={0}
                max={40}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#11131c] px-2 py-1.5 text-xs text-slate-100"
                value={profile.completedCourseCount}
                onChange={(event) => onCompletedCourseCountChange(Number(event.target.value))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400" htmlFor="research-count">
                Research
              </label>
              <input
                id="research-count"
                type="number"
                min={0}
                max={10}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#11131c] px-2 py-1.5 text-xs text-slate-100"
                value={profile.completedResearchCount}
                onChange={(event) => onCompletedResearchCountChange(Number(event.target.value))}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400" htmlFor="extra-count">
                Extras
              </label>
              <input
                id="extra-count"
                type="number"
                min={0}
                max={20}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#11131c] px-2 py-1.5 text-xs text-slate-100"
                value={profile.completedExtracurricularCount}
                onChange={(event) => onCompletedExtracurricularCountChange(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Risk tolerance</p>
            <div className="mt-1 flex gap-2">
              <RiskToggle value="low" active={profile.riskTolerance === "low"} onClick={() => onRiskToleranceChange("low")} />
              <RiskToggle value="medium" active={profile.riskTolerance === "medium"} onClick={() => onRiskToleranceChange("medium")} />
              <RiskToggle value="high" active={profile.riskTolerance === "high"} onClick={() => onRiskToleranceChange("high")} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-700 bg-[#0f1118] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Target outlook</p>
          <div className="mt-2 space-y-2">
            {companyOutlook.length > 0 ? (
              companyOutlook.map((item) => (
                <div key={item.companyId} className="flex items-center justify-between rounded-md bg-[#11131c] px-2 py-1.5">
                  <p className="text-xs text-slate-200">{item.label}</p>
                  <p className={`text-xs font-semibold ${item.hasRoute ? "text-cyan-200" : "text-rose-300"}`}>
                    {item.hasRoute && item.confidence !== null ? `${Math.round(item.confidence * 100)}%` : "No route"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">Add target companies to generate simulated outlook.</p>
            )}
          </div>
        </section>

        <section>
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="include-tags">
            Interest tags (multi-select)
          </label>
          <select
            id="include-tags"
            multiple
            size={Math.min(tags.length, 6)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-sm text-slate-100"
            value={filters.includeTags}
            onChange={(event) => onIncludeTagsChange(readMultiSelectValue(event))}
          >
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-400" htmlFor="exclude-tags">
            Excluded tags
          </label>
          <select
            id="exclude-tags"
            multiple
            size={Math.min(tags.length, 4)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-[#11131c] px-3 py-2 text-sm text-slate-100"
            value={filters.excludeTags}
            onChange={(event) => onExcludeTagsChange(readMultiSelectValue(event))}
          >
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Eliminated clubs</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {filters.eliminatedClubIds.length > 0 ? (
              filters.eliminatedClubIds.map((clubId) => {
                const clubLabel = clubs.find((club) => club.id === clubId)?.label ?? clubId;

                return (
                  <button
                    key={clubId}
                    type="button"
                    className="rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-xs text-rose-100"
                    onClick={() => onToggleEliminatedClub(clubId)}
                  >
                    {clubLabel} ×
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-slate-500">No clubs eliminated.</p>
            )}
          </div>

          <div className="mt-2 space-y-1">
            {clubs.map((club) => (
              <button
                key={club.id}
                type="button"
                className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition ${eliminatedSet.has(club.id) ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-slate-700 bg-[#11131c] text-slate-200 hover:bg-[#171b26]"}`}
                onClick={() => onToggleEliminatedClub(club.id)}
              >
                {eliminatedSet.has(club.id) ? "Re-enable" : "Mark unavailable"} · {club.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Path summary</p>
          <div className="mt-2 space-y-2">
            {primaryPath ? (
              <PathCard
                label="Recommended"
                path={primaryPath}
                description={pathDescriptions[primaryPath.id] ?? ""}
                active={activePathId === primaryPath.id}
                onClick={() => onSelectPath(primaryPath.id)}
              />
            ) : null}
            {secondaryPaths.map((path, index) => (
              <PathCard
                key={path.id}
                label={`Alternative ${index + 1}`}
                path={path}
                description={pathDescriptions[path.id] ?? ""}
                active={activePathId === path.id}
                onClick={() => onSelectPath(path.id)}
              />
            ))}
            {primaryPath || secondaryPaths.length > 0 ? (
              <button
                type="button"
                className="w-full rounded-md border border-slate-700 bg-[#11131c] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-[#171b26]"
                onClick={() => onSelectPath(null)}
              >
                Clear route selection
              </button>
            ) : null}
            {!primaryPath ? <p className="text-xs text-rose-300">{noRouteReason ?? "No route yet."}</p> : null}
          </div>
        </section>

        <section className="space-y-2">
          <ToggleRow
            label="Focus mode"
            description="Dim unrelated nodes and emphasize relevant paths."
            checked={filters.focusMode}
            onClick={onToggleFocusMode}
          />
          <ToggleRow
            label="Show full tree"
            description="Clear all dimming and inspect the complete ecosystem."
            checked={filters.showFullTree}
            onClick={onToggleShowFullTree}
          />
          <ToggleRow
            label="Include cross-club bridges"
            description="Allow lateral transitions between clubs."
            checked={filters.includeClubBridges}
            onClick={onToggleClubBridges}
          />
        </section>
      </div>

      <div className="border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          className="w-full rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
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
  onToggleFocusMode,
  onToggleShowFullTree,
  onToggleClubBridges,
  onClearFilters,
}: ControlRailProps) {
  return (
    <>
      <aside className="hidden h-full w-[360px] shrink-0 border-r border-slate-800 bg-[#0c0f16] md:block">
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
          onToggleFocusMode={onToggleFocusMode}
          onToggleShowFullTree={onToggleShowFullTree}
          onToggleClubBridges={onToggleClubBridges}
          onClearFilters={onClearFilters}
        />
      </aside>

      <button
        type="button"
        className="fixed bottom-4 left-4 z-40 rounded-full border border-slate-700 bg-[#0f1118] px-4 py-2 text-sm font-medium text-slate-100 shadow-lg md:hidden"
        onClick={() => onMobileOpenChange(true)}
      >
        Filters
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 transition md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => onMobileOpenChange(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-x-0 bottom-0 z-50 h-[86dvh] transform rounded-t-2xl border-t border-slate-700 bg-[#0c0f16] transition duration-300 md:hidden ${mobileOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <p className="text-sm font-semibold text-slate-100">Filters</p>
          <button
            type="button"
            className="rounded-md border border-slate-700 bg-[#11131c] px-3 py-1.5 text-sm text-slate-200"
            onClick={() => onMobileOpenChange(false)}
          >
            Close
          </button>
        </div>
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
          onToggleFocusMode={onToggleFocusMode}
          onToggleShowFullTree={onToggleShowFullTree}
          onToggleClubBridges={onToggleClubBridges}
          onClearFilters={onClearFilters}
        />
      </aside>
    </>
  );
}

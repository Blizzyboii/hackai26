"use client";

import { useState } from "react";

type Item = { id: string; title: string; status: "Planned" | "Building" | "Done" };

export default function ApplicationPage() {
  const [items, setItems] = useState<Item[]>([
    { id: "1", title: "Define product concept", status: "Planned" },
    { id: "2", title: "Create landing page", status: "Building" },
    { id: "3", title: "Practice final demo", status: "Done" },
  ]);
  const [draft, setDraft] = useState("");

  const addItem = () => {
    if (!draft.trim()) return;
    setItems((prev) => [...prev, { id: crypto.randomUUID(), title: draft.trim(), status: "Planned" }]);
    setDraft("");
  };

  const updateStatus = (id: string, status: Item["status"]) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Application Placeholder</p>
          <h1 className="mt-1 text-3xl font-semibold">Project Workspace</h1>
          <p className="mt-2 text-sm text-slate-600">A vanilla fake app shell you can expand later.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Task Board</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a placeholder task"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            />
            <button onClick={addItem} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Add
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_180px] md:items-center">
                <p className="text-sm font-medium">{item.title}</p>
                <select
                  value={item.status}
                  onChange={(e) => updateStatus(item.id, e.target.value as Item["status"])}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                >
                  <option>Planned</option>
                  <option>Building</option>
                  <option>Done</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

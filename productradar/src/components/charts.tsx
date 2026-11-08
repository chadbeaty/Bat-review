"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";

// Charts for the product page. Data arrives already shaped by the server.

const AXIS = { fontSize: 11, fill: "#64748b" };

export function MentionsChart({ data }: { data: { day: string; mentions: number; creators: number }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Mentions per day">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="mentions" name="Mentions" fill="#4f46e5" radius={[3, 3, 0, 0]} />
          <Bar dataKey="creators" name="New creators" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreHistoryChart({ data }: { data: { at: string; overall: number; momentum: number | null; demand: number | null; competition: number | null }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Opportunity score history">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="at" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="overall" name="Overall" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="momentum" name="Momentum" stroke="#10b981" strokeWidth={1.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="demand" name="Demand" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="competition" name="Competition" stroke="#94a3b8" strokeWidth={1.5} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

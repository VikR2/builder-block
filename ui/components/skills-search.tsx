"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { parseJSON } from "@/lib/utils";

interface Skill {
  id: number;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  description: string;
  complexity: string;
  nlp_keywords: string | null;
  variables_required: string | null;
  usage_count: number;
}

interface SkillsSearchProps {
  initialSkills: Skill[];
  categories: { category: string; count: number }[];
  searchAction: (query: string) => Promise<Skill[]>;
}

export function SkillsSearch({
  initialSkills,
  categories,
  searchAction,
}: SkillsSearchProps) {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState(initialSkills);
  const [isSearching, setIsSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setIsSearching(value.length > 0);

      if (value.trim().length === 0) {
        setSkills(initialSkills);
        return;
      }

      startTransition(async () => {
        try {
          const results = await searchAction(value);
          setSkills(results);
        } catch {
          // Fallback to client-side filter
          const filtered = initialSkills.filter(
            (s) =>
              s.name.toLowerCase().includes(value.toLowerCase()) ||
              s.description.toLowerCase().includes(value.toLowerCase()) ||
              s.category.toLowerCase().includes(value.toLowerCase())
          );
          setSkills(filtered);
        }
      });
    },
    [initialSkills, searchAction]
  );

  // Group skills by category (only when not searching)
  const skillsByCategory = isSearching
    ? null
    : skills.reduce(
        (acc, skill) => {
          if (!acc[skill.category]) {
            acc[skill.category] = [];
          }
          acc[skill.category].push(skill);
          return acc;
        },
        {} as Record<string, Skill[]>
      );

  return (
    <div className="flex flex-col gap-8">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className={`w-5 h-5 transition-colors ${
              isPending ? "text-primary animate-pulse" : "text-muted-foreground"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="search"
          placeholder="Search skills by name, description, or keywords..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
        />
        {query && (
          <button
            onClick={() => handleSearch("")}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Results Info */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {skills.length} result{skills.length !== 1 ? "s" : ""} for &quot;{query}&quot;
          </span>
          {isPending && (
            <span className="inline-flex items-center gap-1 text-primary">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching...
            </span>
          )}
        </div>
      )}

      {/* Category Summary (only when not searching) */}
      {!isSearching && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {categories.map((cat) => (
            <div
              key={cat.category}
              className="rounded-md border bg-card p-4 text-center hover:border-primary/50 transition-colors cursor-default"
            >
              <div className="text-2xl font-bold text-primary">{cat.count}</div>
              <div className="text-sm text-muted-foreground">{cat.category}</div>
            </div>
          ))}
        </div>
      )}

      {/* Skills Display */}
      {isSearching ? (
        // Flat list for search results
        <div className="grid gap-4">
          {skills.length === 0 ? (
            <div className="rounded-lg border bg-muted/50 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-muted-foreground">No skills match your search</p>
              <button
                onClick={() => handleSearch("")}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            skills.map((skill) => <SkillCard key={skill.id} skill={skill} />)
          )}
        </div>
      ) : (
        // Grouped by category
        skillsByCategory &&
        Object.entries(skillsByCategory).map(([category, categorySkills]) => (
          <div key={category} className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              {category}
              <span className="text-sm font-normal text-muted-foreground">
                ({categorySkills.length})
              </span>
            </h2>
            <div className="grid gap-4">
              {categorySkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const keywords = parseJSON<string[]>(skill.nlp_keywords) || [];
  const variables = parseJSON<string[]>(skill.variables_required) || [];

  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="skill-card rounded-lg border bg-card p-6 hover:bg-accent/50 transition-colors block"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{skill.name}</h3>
              {skill.subcategory && (
                <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                  {skill.subcategory}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{skill.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
              {skill.complexity}
            </span>
            {skill.usage_count > 0 && (
              <span className="text-xs text-muted-foreground">
                Used in {skill.usage_count} script{skill.usage_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keywords.slice(0, 6).map((keyword, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {keyword}
              </span>
            ))}
            {keywords.length > 6 && (
              <span className="text-xs px-2 py-0.5 text-muted-foreground">
                +{keywords.length - 6} more
              </span>
            )}
          </div>
        )}

        {/* Variables */}
        {variables.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Variables:</span> {variables.join(", ")}
          </div>
        )}
      </div>
    </Link>
  );
}

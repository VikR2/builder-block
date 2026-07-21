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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setIsSearching(value.length > 0);
      setActiveCategory(null);

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

  const handleCategoryClick = (category: string) => {
    if (activeCategory === category) {
      setActiveCategory(null);
    } else {
      setActiveCategory(category);
    }
    setQuery("");
    setIsSearching(false);
  };

  // Filter by category if active
  const displaySkills = activeCategory
    ? initialSkills.filter((s) => s.category === activeCategory)
    : skills;

  // Group skills by category (only when not searching and no category filter)
  const skillsByCategory =
    isSearching || activeCategory
      ? null
      : displaySkills.reduce(
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
    <div className="flex flex-col gap-6">
      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className={`w-5 h-5 transition-colors ${
              isPending ? "text-amber-500 animate-pulse" : "text-muted-foreground"
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
          className="w-full pl-12 pr-4 py-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-lg"
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
            {displaySkills.length} result{displaySkills.length !== 1 ? "s" : ""} for &quot;{query}&quot;
          </span>
          {isPending && (
            <span className="inline-flex items-center gap-1 text-amber-500">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching...
            </span>
          )}
        </div>
      )}

      {/* Category Filter (only when not searching) */}
      {!isSearching && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              !activeCategory
                ? "bg-amber-500 text-background shadow-md shadow-amber-500/25"
                : "bg-card border border-border hover:border-amber-500/50 text-foreground"
            }`}
          >
            All ({initialSkills.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => handleCategoryClick(cat.category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCategory === cat.category
                  ? "bg-amber-500 text-background shadow-md shadow-amber-500/25"
                  : "bg-card border border-border hover:border-amber-500/50 text-foreground"
              }`}
            >
              {cat.category} ({cat.count})
            </button>
          ))}
        </div>
      )}

      {/* Active Category Header */}
      {activeCategory && (
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{activeCategory}</h2>
          <span className="text-muted-foreground">({displaySkills.length} skills)</span>
          <button
            onClick={() => setActiveCategory(null)}
            className="ml-2 text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filter
          </button>
        </div>
      )}

      {/* Skills Display */}
      {isSearching || activeCategory ? (
        // Flat list for search results or category filter
        <div className="grid gap-4">
          {displaySkills.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">No skills found</h3>
              <p className="text-muted-foreground mb-4">Try a different search term or clear filters</p>
              <button
                onClick={() => {
                  handleSearch("");
                  setActiveCategory(null);
                }}
                className="text-sm font-medium text-amber-500 hover:text-amber-400"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            displaySkills.map((skill) => <SkillCard key={skill.id} skill={skill} />)
          )}
        </div>
      ) : (
        // Grouped by category
        skillsByCategory &&
        Object.entries(skillsByCategory).map(([category, categorySkills]) => (
          <div key={category} className="flex flex-col gap-4">
            <button
              onClick={() => handleCategoryClick(category)}
              className="text-left group"
            >
              <h2 className="text-2xl font-bold flex items-center gap-2 group-hover:text-amber-500 transition-colors">
                {category}
                <span className="text-sm font-normal text-muted-foreground">
                  ({categorySkills.length})
                </span>
                <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </h2>
            </button>
            <div className="grid gap-3">
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

  const complexityColor = {
    Basic: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    Intermediate: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    Advanced: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  }[skill.complexity] || "text-muted-foreground bg-muted border-border";

  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="group rounded-xl border border-border bg-card p-5 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5 transition-all block"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <h3 className="font-semibold text-lg group-hover:text-amber-500 transition-colors">
                {skill.name}
              </h3>
              {skill.subcategory && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {skill.subcategory}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {skill.description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-lg font-medium border ${complexityColor}`}>
              {skill.complexity}
            </span>
            {skill.usage_count > 0 && (
              <span className="text-xs text-muted-foreground">
                Used {skill.usage_count}x
              </span>
            )}
          </div>
        </div>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.slice(0, 5).map((keyword, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-md bg-muted/50 text-muted-foreground"
              >
                {keyword}
              </span>
            ))}
            {keywords.length > 5 && (
              <span className="text-xs px-2 py-0.5 text-muted-foreground">
                +{keywords.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Variables */}
        {variables.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span>{variables.slice(0, 3).join(", ")}{variables.length > 3 ? ` +${variables.length - 3}` : ""}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

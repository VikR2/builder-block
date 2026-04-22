-- Migration: remove TeachTrades / TTFM app-facing skill content
-- Date: 2026-03-21

PRAGMA foreign_keys = ON;

DELETE FROM skill_sources
WHERE lower(coalesce(source_title, '')) LIKE '%teachtrades%'
   OR lower(coalesce(source_title, '')) LIKE '%teach trades%'
   OR lower(coalesce(source_title, '')) LIKE '%ttrades%'
   OR lower(coalesce(source_title, '')) LIKE '%ttfm%'
   OR lower(coalesce(source_url, '')) LIKE '%teachtrades%'
   OR lower(coalesce(source_url, '')) LIKE '%teach trades%'
   OR lower(coalesce(source_url, '')) LIKE '%ttrades%'
   OR lower(coalesce(source_url, '')) LIKE '%ttfm%';

DELETE FROM skill_combinations
WHERE lower(coalesce(name, '')) LIKE '%teachtrades%'
   OR lower(coalesce(name, '')) LIKE '%teach trades%'
   OR lower(coalesce(name, '')) LIKE '%ttrades%'
   OR lower(coalesce(name, '')) LIKE '%ttfm%'
   OR lower(coalesce(description, '')) LIKE '%teachtrades%'
   OR lower(coalesce(description, '')) LIKE '%teach trades%'
   OR lower(coalesce(description, '')) LIKE '%ttrades%'
   OR lower(coalesce(description, '')) LIKE '%ttfm%';

DELETE FROM skills
WHERE lower(coalesce(name, '')) LIKE '%teachtrades%'
   OR lower(coalesce(name, '')) LIKE '%teach trades%'
   OR lower(coalesce(name, '')) LIKE '%ttrades%'
   OR lower(coalesce(name, '')) LIKE '%ttfm%'
   OR lower(coalesce(slug, '')) LIKE '%teachtrades%'
   OR lower(coalesce(slug, '')) LIKE '%teach trades%'
   OR lower(coalesce(slug, '')) LIKE '%ttrades%'
   OR lower(coalesce(slug, '')) LIKE '%ttfm%'
   OR lower(coalesce(category, '')) LIKE '%teachtrades%'
   OR lower(coalesce(category, '')) LIKE '%teach trades%'
   OR lower(coalesce(category, '')) LIKE '%ttrades%'
   OR lower(coalesce(category, '')) LIKE '%ttfm%'
   OR lower(coalesce(subcategory, '')) LIKE '%teachtrades%'
   OR lower(coalesce(subcategory, '')) LIKE '%teach trades%'
   OR lower(coalesce(subcategory, '')) LIKE '%ttrades%'
   OR lower(coalesce(subcategory, '')) LIKE '%ttfm%'
   OR lower(coalesce(description, '')) LIKE '%teachtrades%'
   OR lower(coalesce(description, '')) LIKE '%teach trades%'
   OR lower(coalesce(description, '')) LIKE '%ttrades%'
   OR lower(coalesce(description, '')) LIKE '%ttfm%';

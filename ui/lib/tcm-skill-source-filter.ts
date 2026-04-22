import { buildTeachTradesSkillSql } from './teachtrades-filter';

function buildTeacherVideoSourceSql(alias?: string): string {
  const qualifiedSkillId = alias ? `${alias}.id` : 'skills.id';

  return `
    EXISTS (
      SELECT 1
      FROM skill_sources ss
      WHERE ss.skill_id = ${qualifiedSkillId}
        AND (
          ss.source_type = 'local_video'
          OR (
            ss.source_type = 'youtube'
            AND EXISTS (
              SELECT 1
              FROM processed_videos pv
              WHERE pv.url = ss.source_url
                AND pv.processing_status IN ('completed', 'reprocessed')
                AND lower(coalesce(pv.title, '')) NOT LIKE 'youtube:%'
                AND lower(coalesce(pv.title, '')) NOT LIKE 'sad:%'
                AND lower(coalesce(pv.title, '')) NOT LIKE '%mock%'
                AND lower(coalesce(pv.title, '')) NOT LIKE '%teachtrades%'
                AND lower(coalesce(pv.title, '')) NOT LIKE '%teach trades%'
                AND lower(coalesce(pv.title, '')) NOT LIKE '%ttrades%'
                AND lower(coalesce(pv.title, '')) NOT LIKE '%ttfm%'
            )
          )
        )
    )
  `;
}

export function buildVisibleTCMSkillSql(alias?: string): string {
  const skillRef = alias || 'skills';

  return `(
    ${buildTeachTradesSkillSql(skillRef)}
    AND ${buildTeacherVideoSourceSql(skillRef)}
  )`;
}

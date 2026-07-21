'use client';

import { useState } from 'react';
import { Sparkles, X, Check, Plus, Link2, SkipForward } from 'lucide-react';

interface ExtractedSkill {
  name: string;
  description: string;
  category: 'NEW' | 'AMBIGUOUS' | 'EXISTING';
  matchedSkillId?: number;
  matchedSkillName?: string;
  matchScore?: number;
}

interface CheckpointSkillsProps {
  videoTitle: string;
  skills: ExtractedSkill[];
  onRespond: (response: {
    approvedSkills: Array<{
      name: string;
      description: string;
      action: 'create' | 'link' | 'skip';
      existingId?: number;
    }>;
  }) => void;
  onClose?: () => void;
}

type SkillAction = 'create' | 'link' | 'skip';

export function CheckpointSkills({ videoTitle, skills, onRespond, onClose }: CheckpointSkillsProps) {
  const [isResponding, setIsResponding] = useState(false);
  const [skillActions, setSkillActions] = useState<Map<string, SkillAction>>(() => {
    const initial = new Map<string, SkillAction>();
    skills.forEach(skill => {
      if (skill.category === 'NEW') {
        initial.set(skill.name, 'create');
      } else if (skill.category === 'EXISTING' && skill.matchScore && skill.matchScore >= 0.7) {
        initial.set(skill.name, 'link');
      } else {
        initial.set(skill.name, 'skip');
      }
    });
    return initial;
  });

  const handleRespond = async () => {
    setIsResponding(true);
    const approvedSkills = skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      action: skillActions.get(skill.name) || 'skip',
      existingId: skill.matchedSkillId
    }));
    await onRespond({ approvedSkills });
    setIsResponding(false);
  };

  const setAction = (skillName: string, action: SkillAction) => {
    setSkillActions(prev => new Map(prev).set(skillName, action));
  };

  const newSkills = skills.filter(s => s.category === 'NEW');
  const ambiguousSkills = skills.filter(s => s.category === 'AMBIGUOUS');
  const existingSkills = skills.filter(s => s.category === 'EXISTING');

  const actionCounts = {
    create: Array.from(skillActions.values()).filter(a => a === 'create').length,
    link: Array.from(skillActions.values()).filter(a => a === 'link').length,
    skip: Array.from(skillActions.values()).filter(a => a === 'skip').length
  };

  return (
    <div className="rounded-xl border border-amber-500/50 bg-card overflow-hidden max-w-2xl mx-auto">
      <div className="p-4 bg-amber-500/10 border-b border-amber-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold">Review Extracted Skills</h3>
              <p className="text-sm text-muted-foreground">{videoTitle}</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-accent rounded">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {/* Summary */}
        <div className="flex gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>{newSkills.length} New</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span>{ambiguousSkills.length} Ambiguous</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-sky-500" />
            <span>{existingSkills.length} Existing</span>
          </div>
        </div>

        {/* New Skills */}
        {newSkills.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-emerald-500 mb-2 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Skills (will create)
            </h4>
            <div className="space-y-2">
              {newSkills.map(skill => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  action={skillActions.get(skill.name) || 'create'}
                  onActionChange={(action) => setAction(skill.name, action)}
                  showLink={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ambiguous Skills */}
        {ambiguousSkills.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-amber-500 mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Ambiguous (needs review)
            </h4>
            <div className="space-y-2">
              {ambiguousSkills.map(skill => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  action={skillActions.get(skill.name) || 'skip'}
                  onActionChange={(action) => setAction(skill.name, action)}
                  showLink={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Existing Skills */}
        {existingSkills.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-sky-500 mb-2 flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Existing (will link to video)
            </h4>
            <div className="space-y-2">
              {existingSkills.map(skill => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  action={skillActions.get(skill.name) || 'link'}
                  onActionChange={(action) => setAction(skill.name, action)}
                  showLink={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border/50 bg-muted/20">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            Creating {actionCounts.create} • Linking {actionCounts.link} • Skipping {actionCounts.skip}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRespond}
            disabled={isResponding}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Confirm & Continue
          </button>
          <button
            onClick={() => onRespond({ approvedSkills: skills.map(s => ({ name: s.name, description: s.description, action: 'skip' })) })}
            disabled={isResponding}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-border bg-card text-muted-foreground font-medium rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" />
            Skip All
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  action,
  onActionChange,
  showLink
}: {
  skill: ExtractedSkill;
  action: SkillAction;
  onActionChange: (action: SkillAction) => void;
  showLink: boolean;
}) {
  return (
    <div className="p-3 rounded-lg border border-border/50 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{skill.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {skill.description}
          </div>
          {skill.matchedSkillName && (
            <div className="text-xs text-amber-500 mt-1">
              Similar to: #{skill.matchedSkillId} "{skill.matchedSkillName}"
              {skill.matchScore && ` (${Math.round(skill.matchScore * 100)}% match)`}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onActionChange('create')}
            className={`p-1.5 rounded transition-colors ${
              action === 'create'
                ? 'bg-emerald-500/20 text-emerald-500'
                : 'text-muted-foreground hover:bg-accent'
            }`}
            title="Create new skill"
          >
            <Plus className="h-4 w-4" />
          </button>
          {showLink && skill.matchedSkillId && (
            <button
              onClick={() => onActionChange('link')}
              className={`p-1.5 rounded transition-colors ${
                action === 'link'
                  ? 'bg-sky-500/20 text-sky-500'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
              title="Link to existing skill"
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onActionChange('skip')}
            className={`p-1.5 rounded transition-colors ${
              action === 'skip'
                ? 'bg-muted text-muted-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
            title="Skip this skill"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

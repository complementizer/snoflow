import { useState } from 'react';
import { Settings, ChevronDown, FileText, FileStack } from 'lucide-react';
import { FullNoteExample } from '../services/examples';

interface SettingsBarProps {
  topK: number;
  setTopK: (value: number) => void;
  threshold: number;
  setThreshold: (value: number) => void;
  autoAnalyze: boolean;
  setAutoAnalyze: (value: boolean) => void;
  shortExamples: string[];
  fullNotes: FullNoteExample[];
  onExampleSelect: (text: string) => void;
}

export function SettingsBar({ topK, setTopK, threshold, setThreshold, autoAnalyze, setAutoAnalyze, shortExamples, fullNotes, onExampleSelect }: SettingsBarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <button
          onClick={() => { setShowSettings(!showSettings); setShowExamples(false); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showSettings ? 'bg-slate-200 text-slate-800' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
          <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>

        {showSettings && (
          <div className="absolute z-30 top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm text-slate-600 mb-2">
                  <span>Candidates (top-k)</span>
                  <span className="font-semibold text-slate-800">{topK}</span>
                </label>
                <input type="range" min={1} max={10} value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                <div className="flex justify-between text-xs text-slate-400 mt-1"><span>1</span><span>10</span></div>
              </div>
              <div>
                <label className="flex justify-between text-sm text-slate-600 mb-2">
                  <span>Score threshold</span>
                  <span className="font-semibold text-slate-800">{(threshold * 100).toFixed(0)}%</span>
                </label>
                <input type="range" min={0} max={100} step={5} value={threshold * 100} onChange={(e) => setThreshold(Number(e.target.value) / 100)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                <div className="flex justify-between text-xs text-slate-400 mt-1"><span>0%</span><span>100%</span></div>
              </div>
              <div>
                <label className="flex items-center justify-between text-sm text-slate-600 cursor-pointer">
                  <span>Auto-analyze</span>
                  <button
                    onClick={() => setAutoAnalyze(!autoAnalyze)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoAnalyze ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoAnalyze ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </label>
                <p className="text-xs text-slate-400 mt-1">Run LLM analysis during extraction (slower but shows certainty immediately)</p>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  <strong>Top-k:</strong> Max candidates per entity.<br />
                  <strong>Threshold:</strong> Hide low-confidence predictions.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => { setShowExamples(!showExamples); setShowSettings(false); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showExamples ? 'bg-slate-200 text-slate-800' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Examples
          <ChevronDown className={`w-4 h-4 transition-transform ${showExamples ? 'rotate-180' : ''}`} />
        </button>

        {showExamples && (
          <div className="absolute z-30 top-full left-0 mt-2 w-[480px] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden max-h-[400px] overflow-y-auto">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 sticky top-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <FileText className="w-3.5 h-3.5" />Quick Examples
              </div>
            </div>
            {shortExamples.map((text, i) => (
              <button key={`short-${i}`} onClick={() => { onExampleSelect(text); setShowExamples(false); }}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 transition-colors">{text}</button>
            ))}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 border-t sticky top-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <FileStack className="w-3.5 h-3.5" />Full Clinical Notes
              </div>
            </div>
            {fullNotes.map((note, i) => (
              <button key={`full-${i}`} onClick={() => { onExampleSelect(note.text); setShowExamples(false); }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 transition-colors group">
                <div className="font-medium text-sm text-slate-800 group-hover:text-blue-600">{note.title}</div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{note.text.slice(0, 150)}...</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {(showSettings || showExamples) && (
        <div className="fixed inset-0 z-20" onClick={() => { setShowSettings(false); setShowExamples(false); }} />
      )}
    </div>
  );
}

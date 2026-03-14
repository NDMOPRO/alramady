/*
 * Sources Panel - Left panel in NotebookLM Canvas
 * Exact specs from original:
 * - Width: 310px, white bg, border-radius: 16px
 * - Header: 48px height, font-size: 16px, font-weight: 400, border-bottom: 1px solid #DDE1EB
 * - Add sources button: centered, bordered pill, h=36px → triggers AddSourceDialog
 * - Search box: h=106px, w=278px, border=1px solid #dde1eb, borderRadius=16px, padding=12px 8px
 * - Empty state: description icon + text
 */

import { useState } from 'react';
import MaterialIcon from './MaterialIcon';

interface SourcesPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onAddSourceClick: () => void;
  sources: Array<{ id: string; title: string; type: string }>;
}

export default function SourcesPanel({ isOpen, onToggle, onAddSourceClick, sources }: SourcesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  return (
    <section
      className="flex flex-col bg-white overflow-hidden"
      style={{ width: 310, minWidth: 310, borderRadius: 16 }}
    >
      {/* Panel Header - 48px, font 16px weight 400 */}
      <div className="flex items-center justify-between px-4 shrink-0" style={{ height: 48, borderBottom: '1px solid #dde1eb' }}>
        <span className="text-[16px] font-normal text-[#1b1b1c]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          Sources
        </span>
        <button
          onClick={onToggle}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          title="Collapse source panel"
        >
          <MaterialIcon icon="dock_to_right" size={20} className="text-[#444746]" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Add Sources Button */}
        <div className="px-4 pt-3 pb-3">
          <button
            onClick={onAddSourceClick}
            className="flex items-center justify-center gap-1.5 w-full rounded-full border text-[14px] text-[#444746] hover:bg-black/[0.03] transition-colors"
            style={{ borderColor: '#dde1eb', fontFamily: "'Google Sans Text', sans-serif", height: 36 }}
          >
            <MaterialIcon icon="add" size={18} className="text-[#444746]" />
            Add sources
          </button>
        </div>

        {/* Search Box - ALL inside one bordered container, borderRadius=16px */}
        <div className="px-4 mb-1">
          <div className="flex flex-col" style={{ border: '1px solid #dde1eb', borderRadius: 16, padding: '12px 8px' }}>
            {/* Search input row */}
            <div className="flex items-start gap-2 px-1">
              <MaterialIcon icon="search" size={18} className="text-[#5f6368] mt-0.5 shrink-0" />
              <textarea
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search the web for new sources"
                className="flex-1 text-[14px] text-[#303030] placeholder-[#5f6368] bg-transparent border-none outline-none resize-none leading-5"
                rows={2}
                style={{ fontFamily: "'Google Sans Text', sans-serif" }}
              />
            </div>
            {/* Search Options Row - INSIDE the bordered container */}
            <div className="flex items-center gap-1 pt-2">
              <button className="flex items-center gap-0.5 text-[12px] text-[#444746] hover:bg-black/5 rounded-full px-2 py-1 transition-colors">
                <MaterialIcon icon="language" size={16} className="text-[#444746]" />
                <MaterialIcon icon="keyboard_arrow_down" size={14} className="text-[#444746]" />
              </button>
              <button className="flex items-center gap-0.5 text-[12px] text-[#444746] hover:bg-black/5 rounded-full px-2 py-1 transition-colors">
                <MaterialIcon icon="search_spark" size={14} className="text-[#444746]" />
                <MaterialIcon icon="keyboard_arrow_down" size={14} className="text-[#444746]" />
              </button>
              <div className="flex-1" />
              <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors">
                <MaterialIcon icon="arrow_forward" size={18} className="text-[#bdc1c6]" />
              </button>
            </div>
          </div>
        </div>

        {/* Sources List or Empty State */}
        {sources.length > 0 ? (
          <div className="flex-1 flex flex-col px-3 pt-2">
            {sources.map((source) => (
              <div key={source.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-black/[0.03] transition-colors cursor-pointer">
                <MaterialIcon icon={source.type === 'pdf' ? 'picture_as_pdf' : source.type === 'website' ? 'language' : 'description'} size={20} className="text-[#444746] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1b1b1c] truncate" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {source.title}
                  </p>
                  <p className="text-[11px] text-[#5f6368] mt-0.5 capitalize" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
                    {source.type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-8">
            <MaterialIcon icon="description" size={36} className="text-[#bdc1c6] mb-3" />
            <p className="text-[14px] font-medium text-[#303030] mb-1.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              Saved sources will appear here
            </p>
            <p className="text-[12px] text-[#5f6368] leading-[16px]" style={{ fontFamily: "'Google Sans Text', sans-serif" }}>
              Click Add source above to add PDFs, websites, text, videos or audio files. Or import a file directly from Google Drive.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

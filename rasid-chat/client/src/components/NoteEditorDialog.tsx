/*
 * Note Editor Dialog - Opens when clicking on a note card
 * Full-screen overlay with note editing capability
 */

import { useState } from 'react';
import MaterialIcon from './MaterialIcon';

interface NoteEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  noteTitle: string;
  noteContent: string;
  onSave: (title: string, content: string) => void;
}

export default function NoteEditorDialog({ isOpen, onClose, noteTitle, noteContent, onSave }: NoteEditorDialogProps) {
  const [title, setTitle] = useState(noteTitle);
  const [content, setContent] = useState(noteContent);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(title, content);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Dialog */}
      <div
        className="relative bg-white w-full max-w-[640px] mx-4 overflow-hidden flex flex-col"
        style={{ borderRadius: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <MaterialIcon icon="sticky_note_2" size={22} className="text-[#444746]" />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-[16px] font-medium text-[#303030] bg-transparent border-none outline-none"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              placeholder="Note title"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="text-[13px] text-[#1a73e8] px-3 py-1.5 rounded-full hover:bg-[#e8f0fe] transition-colors"
              style={{ fontFamily: "'Google Sans Text', sans-serif" }}
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            >
              <MaterialIcon icon="close" size={20} className="text-[#444746]" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-6 pb-3 shrink-0" style={{ borderBottom: '1px solid #dde1eb' }}>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 transition-colors">
            <MaterialIcon icon="format_bold" size={18} className="text-[#444746]" />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 transition-colors">
            <MaterialIcon icon="format_italic" size={18} className="text-[#444746]" />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 transition-colors">
            <MaterialIcon icon="format_underlined" size={18} className="text-[#444746]" />
          </button>
          <div className="w-px h-5 mx-1" style={{ backgroundColor: '#dde1eb' }} />
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 transition-colors">
            <MaterialIcon icon="format_list_bulleted" size={18} className="text-[#444746]" />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/5 transition-colors">
            <MaterialIcon icon="format_list_numbered" size={18} className="text-[#444746]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full min-h-[200px] text-[14px] text-[#303030] bg-transparent border-none outline-none resize-none leading-6"
            style={{ fontFamily: "'Google Sans Text', sans-serif" }}
            placeholder="Start writing..."
          />
        </div>
      </div>
    </div>
  );
}

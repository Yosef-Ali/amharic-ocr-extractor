import React, { useRef } from 'react';
import { Upload, FileText } from 'lucide-react';

interface Props {
  onFile: (file: File) => void;
}

export default function UploadZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="
        relative overflow-hidden group
        border-2 border-dashed border-red-300/60 rounded-3xl p-16
        flex flex-col items-center gap-5
        cursor-pointer select-none bg-white
        hover:border-red-500 hover:bg-red-50/50 hover:shadow-xl hover:shadow-red-500/5
        transition-all duration-300 ease-out
      "
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-orange-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-red-100 to-red-50 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300 ease-out">
        <Upload className="text-red-600 group-hover:animate-bounce mt-1" size={36} strokeWidth={2.5} />
      </div>
      
      <div className="text-center relative z-10">
        <p className="text-gray-800 font-bold text-xl tracking-tight">
          Drop your document here
        </p>
        <p className="text-gray-500 text-sm mt-1.5 font-medium">
          or click to browse from your computer
        </p>
      </div>

      <div className="flex items-center gap-3 mt-4 relative z-10 flex-wrap justify-center">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100/80 px-3 py-1.5 rounded-full">
          <FileText size={14} className="text-red-500" /> PDF
        </span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100/80 px-3 py-1.5 rounded-full">
          <FileText size={14} className="text-blue-500" /> Word (.docx)
        </span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100/80 px-3 py-1.5 rounded-full">
          <FileText size={14} className="text-green-500" /> Text (.txt)
        </span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100/80 px-3 py-1.5 rounded-full">
          <Upload size={14} className="text-purple-500" /> Images
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

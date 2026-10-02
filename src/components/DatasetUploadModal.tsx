import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Modal } from './common/UIComponents';
import { parseCsvText } from '../utils/csvParser';
import { RawRow } from '../types/recsys';

interface DatasetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetLoaded: (data: {
    rawRows: RawRow[];
    columns: string[];
    datasetName: string;
    rawText: string;
  }) => void;
}

export const DatasetUploadModal: React.FC<DatasetUploadModalProps> = ({
  isOpen,
  onClose,
  onDatasetLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [datasetName, setDatasetName] = useState('Custom Interaction Dataset');
  const [rawText, setRawText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ rows: RawRow[]; cols: string[]; total: number } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDatasetName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        validateAndPreview(content);
      }
    };
    reader.readAsText(file);
  };

  const validateAndPreview = (content: string) => {
    setParseError(null);
    const parsed = parseCsvText(content);
    if (parsed.errors.length > 0) {
      setParseError(parsed.errors.join('; '));
      setPreviewData(null);
      return;
    }
    if (parsed.data.length === 0) {
      setParseError('The file contains 0 data rows.');
      setPreviewData(null);
      return;
    }

    setPreviewData({
      rows: parsed.data.slice(0, 5),
      cols: parsed.columns,
      total: parsed.totalRows,
    });
  };

  const handleTextChange = (text: string) => {
    setRawText(text);
    if (text.trim().length > 10) {
      validateAndPreview(text);
    } else {
      setPreviewData(null);
      setParseError(null);
    }
  };

  const handleApply = () => {
    const parsed = parseCsvText(rawText);
    if (parsed.data.length === 0 || parsed.errors.length > 0) {
      setParseError('Please provide valid CSV/TSV data with at least user and item columns.');
      return;
    }

    onDatasetLoaded({
      rawRows: parsed.data,
      columns: parsed.columns,
      datasetName: datasetName.trim() || 'Custom Dataset',
      rawText,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Load Custom Interaction Dataset" maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Dataset Name
          </label>
          <input
            type="text"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            placeholder="e.g., E-Commerce User Behavior 2024"
          />
        </div>

        {/* Tabs: File Upload vs Raw Paste */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition border-b-2 flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" /> Upload File (.csv, .tsv, .txt)
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`pb-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition border-b-2 flex items-center gap-2 ${
              activeTab === 'paste'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" /> Paste Raw Delimited Text
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 text-center transition bg-slate-950/50">
            <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-200 mb-1">
              Drag and drop your dataset file here, or click to browse
            </p>
            <p className="text-xs text-slate-400 mb-4">
              Supports CSV, TSV, or Comma-separated files with headers
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg cursor-pointer transition">
              <Upload className="w-4 h-4" /> Browse File
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Paste CSV / TSV with Header Row
            </label>
            <textarea
              rows={7}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="user_id,item_id,rating,timestamp&#10;user_1,prod_101,4.5,2024-03-01T12:00:00Z&#10;user_1,prod_102,5.0,2024-03-02T14:30:00Z&#10;user_2,prod_101,3.0,2024-03-02T16:00:00Z"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Validation Errors */}
        {parseError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div>{parseError}</div>
          </div>
        )}

        {/* Preview of Parsed Data */}
        {previewData && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs mb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Parsed {previewData.total} rows ({previewData.cols.length} columns detected)
              </div>
              <span className="text-slate-400">First 5 rows preview</span>
            </div>
            <div className="overflow-x-auto max-h-40 border border-slate-800 rounded-lg">
              <table className="w-full text-[11px] text-left text-slate-300">
                <thead className="bg-slate-900 text-slate-400 sticky top-0">
                  <tr>
                    {previewData.cols.map((col, idx) => (
                      <th key={idx} className="px-3 py-2 border-b border-slate-800 font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {previewData.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-900/40">
                      {previewData.cols.map((col, cIdx) => (
                        <td key={cIdx} className="px-3 py-1.5 truncate max-w-[150px]">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!previewData || !!parseError}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition shadow-sm"
          >
            Import & Configure Mapping <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
};

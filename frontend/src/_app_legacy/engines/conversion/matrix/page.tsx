'use client';
import { useState } from 'react';

const formats = ['PDF', 'Word', 'Excel', 'CSV', 'JSON', 'XML', 'HTML', 'TXT'];

// true = supported conversion
const matrixData: Record<string, Record<string, boolean>> = {
  PDF: { PDF: false, Word: true, Excel: true, CSV: true, JSON: false, XML: false, HTML: true, TXT: true },
  Word: { PDF: true, Word: false, Excel: false, CSV: false, JSON: false, XML: false, HTML: true, TXT: true },
  Excel: { PDF: true, Word: false, Excel: false, CSV: true, JSON: true, XML: true, HTML: true, TXT: true },
  CSV: { PDF: false, Word: false, Excel: true, CSV: false, JSON: true, XML: true, HTML: true, TXT: true },
  JSON: { PDF: false, Word: false, Excel: true, CSV: true, JSON: false, XML: true, HTML: false, TXT: true },
  XML: { PDF: false, Word: false, Excel: true, CSV: true, JSON: true, XML: false, HTML: true, TXT: true },
  HTML: { PDF: true, Word: true, Excel: false, CSV: false, JSON: false, XML: false, HTML: false, TXT: true },
  TXT: { PDF: true, Word: true, Excel: false, CSV: true, JSON: false, XML: false, HTML: true, TXT: false },
};

export default function ConversionMatrixPage() {
  const [fromFormat, setFromFormat] = useState<string | null>(null);
  const [toFormat, setToFormat] = useState<string | null>(null);

  const totalSupported = Object.values(matrixData).reduce((acc, row) => acc + Object.values(row).filter(Boolean).length, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مصفوفة التحويل</h1>
          <p className="text-gray-500">Conversion Matrix - Format A to Format B</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">
          + تحويل سريع
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'التنسيقات المدعومة', value: formats.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'مسارات التحويل', value: totalSupported, color: 'bg-green-50 text-green-700' },
          { label: 'الأكثر استخداماً', value: 'PDF→Word', color: 'bg-purple-50 text-purple-700' },
          { label: 'نسبة التغطية', value: `${Math.round((totalSupported / (formats.length * (formats.length - 1))) * 100)}%`, color: 'bg-amber-50 text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`${s.color} rounded-xl p-4`}>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-3xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Quick Convert */}
      {fromFormat && toFormat && matrixData[fromFormat]?.[toFormat] && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
          <span className="font-mono font-bold text-green-700">{fromFormat}</span>
          <span className="text-green-500">&#8594;</span>
          <span className="font-mono font-bold text-green-700">{toFormat}</span>
          <span className="text-sm text-green-600 flex-1">التحويل مدعوم / Conversion supported</span>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">بدء التحويل</button>
        </div>
      )}

      {/* Matrix Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-3 text-sm font-medium text-gray-500 text-right">من \ إلى</th>
              {formats.map(f => (
                <th key={f} className="p-3 text-sm font-medium text-gray-700 text-center">
                  <span className="font-mono">{f}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formats.map(from => (
              <tr key={from} className="border-t border-gray-100">
                <td className="p-3 font-mono font-medium text-gray-700">{from}</td>
                {formats.map(to => {
                  const supported = matrixData[from]?.[to];
                  const isSelected = fromFormat === from && toFormat === to;
                  return (
                    <td key={to} className="p-3 text-center">
                      {from === to ? (
                        <span className="text-gray-300">&#8212;</span>
                      ) : (
                        <button
                          onClick={() => { setFromFormat(from); setToFormat(to); }}
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center text-sm transition ${
                            isSelected ? 'ring-2 ring-blue-500' : ''
                          } ${
                            supported
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-50 text-red-300'
                          }`}
                        >
                          {supported ? '&#10003;' : '&#10007;'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 rounded inline-block" /> مدعوم</span>
        <span className="flex items-center gap-2"><span className="w-4 h-4 bg-red-50 rounded inline-block" /> غير مدعوم</span>
      </div>
    </div>
  );
}

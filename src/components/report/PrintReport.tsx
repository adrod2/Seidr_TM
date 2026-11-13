"use client";

import React from 'react';
import { CheckCircle2, Server } from 'lucide-react';
import { SeidrLogo } from '../SeidrLogo';

export const PrintReport = ({ modelData }: { modelData: any }) => {
  if (!modelData) return null;

  const nonCompliantGaps = modelData.complianceGaps?.filter(
    (g: any) => g.status === 'Gap Identified' || g.status === 'Partially Met'
  ) || [];

  // Fallback to English if translation strings are missing
  const t = modelData.uiStrings || {
    reportTitle: "Threat Model Report",
    systemName: "System Name",
    modelId: "Model ID",
    dateGenerated: "Date Generated",
    framework: "Framework",
    riskScore: "Risk Score",
    identifiedThreats: "Identified Threats & Mitigations",
    noThreats: "No threats identified.",
    description: "Description",
    exploitationPath: "Exploitation Path",
    suggestedMitigation: "Suggested Mitigation Action",
    noMitigation: "No specific mitigation provided.",
    complianceGaps: "Compliance Gaps (NIST SP 800-53)",
    noGaps: "No critical compliance gaps identified. All mapped controls are met.",
    controlId: "Control ID",
    title: "Title",
    status: "Status",
    details: "Details"
  };

  return (
    <div className="hidden print:block p-8 bg-white text-black max-w-4xl mx-auto font-sans w-full">
      {/* Header */}
      <div className="border-b-2 border-gray-200 pb-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <SeidrLogo className="h-10 w-10" />
          <h1 className="text-3xl font-bold text-gray-900">{t.reportTitle}</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-semibold text-gray-600">{t.systemName}:</span> {modelData.name}</p>
            <p><span className="font-semibold text-gray-600">{t.modelId}:</span> {modelData.id}</p>
            <p><span className="font-semibold text-gray-600">{t.dateGenerated}:</span> {new Date(modelData.date).toLocaleDateString()}</p>
          </div>
          <div>
            <p><span className="font-semibold text-gray-600">{t.framework}:</span> {modelData.framework}</p>
            <p><span className="font-semibold text-gray-600">{t.riskScore}:</span> {modelData.riskScore}</p>
          </div>
        </div>
      </div>

      {/* Threats Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-2">{t.identifiedThreats}</h2>
        {modelData.threats?.length === 0 ? (
          <p className="text-gray-500">{t.noThreats}</p>
        ) : (
          <div className="space-y-8">
            {modelData.threats?.map((threat: any, index: number) => (
              <div key={threat.id} className="break-inside-avoid border border-gray-200 rounded-lg p-5 bg-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">
                    {index + 1}. {threat.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-200 px-2 py-1 rounded text-gray-700">{threat.id}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      threat.severity === 'Critical' ? 'bg-red-100 text-red-800' : 
                      threat.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                      threat.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {threat.severity} (CVSS: {threat.cvssScore})
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                  <span className="bg-gray-200 px-2 py-0.5 rounded-md text-gray-800 font-medium">{threat.category}</span>
                  <span className="flex items-center gap-1 font-medium"><Server className="h-3.5 w-3.5"/> {threat.componentId}</span>
                </div>

                <div className="space-y-4 text-sm text-gray-800">
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">{t.description}:</p>
                    <p className="leading-relaxed">{threat.description}</p>
                  </div>
                  
                  {threat.reasoning && (
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{t.exploitationPath}:</p>
                      <p className="leading-relaxed">{threat.reasoning}</p>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-md p-4 mt-4 shadow-sm">
                    <p className="font-bold text-emerald-700 flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="h-4 w-4" /> {t.suggestedMitigation}
                    </p>
                    <p className="leading-relaxed text-gray-700">{threat.mitigation || t.noMitigation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compliance Section */}
      <div className="mb-12 break-inside-avoid">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-2">{t.complianceGaps}</h2>
        {nonCompliantGaps.length === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6" />
            <p className="font-medium">{t.noGaps}</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-3 border border-gray-200 font-semibold w-24">{t.controlId}</th>
                <th className="px-4 py-3 border border-gray-200 font-semibold w-1/4">{t.title}</th>
                <th className="px-4 py-3 border border-gray-200 font-semibold w-28">{t.status}</th>
                <th className="px-4 py-3 border border-gray-200 font-semibold">{t.details}</th>
              </tr>
            </thead>
            <tbody>
              {nonCompliantGaps.map((gap: any, idx: number) => (
                <tr key={idx} className="bg-white">
                  <td className="px-4 py-3 border border-gray-200 font-mono font-bold text-gray-900">{gap.controlId}</td>
                  <td className="px-4 py-3 border border-gray-200 font-medium text-gray-900">{gap.title}</td>
                  <td className="px-4 py-3 border border-gray-200">
                    <span className={`font-bold px-2 py-1 rounded text-xs ${gap.status === 'Gap Identified' || gap.status === 'Brecha identificada' ? 'text-red-700 bg-red-50' : 'text-orange-700 bg-orange-50'}`}>
                      {gap.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 border border-gray-200 text-gray-700">{gap.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="text-center text-gray-400 text-xs mt-12 pt-4 border-t border-gray-200">
        Generated by Seidr AI Threat Modeling • {new Date().toISOString()}
      </div>
    </div>
  );
};
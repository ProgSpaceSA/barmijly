'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

interface System { id: string; name: string; description?: string; }
interface Department { id: string; name: string; systems: System[]; }
interface Company { id: string; name: string; domain?: string; departments: Department[]; }

function SystemRow({ system, deptId, onDelete }: { system: System; deptId: string; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
      <div>
        <span className="font-medium">{system.name}</span>
        {system.description && <span className="text-gray-500 text-xs mr-2">{system.description}</span>}
      </div>
      <button onClick={() => onDelete(system.id)} className="text-red-500 hover:text-red-700 text-xs">حذف</button>
    </div>
  );
}

function AddSystemForm({ deptId, onAdd }: { deptId: string; onAdd: (name: string, desc: string) => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  if (!show) return (
    <button onClick={() => setShow(true)} className="text-xs text-indigo-600 hover:underline">+ إضافة نظام</button>
  );
  return (
    <div className="flex gap-2 mt-1">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم النظام" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="وصف" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
      <button onClick={() => { onAdd(name, desc); setName(''); setDesc(''); setShow(false); }} className="bg-indigo-600 text-white px-2 py-1 rounded text-xs">إضافة</button>
      <button onClick={() => setShow(false)} className="text-gray-500 text-xs px-1">×</button>
    </div>
  );
}

export default function CompaniesPage() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyDomain, setNewCompanyDomain] = useState('');
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [addingDept, setAddingDept] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');

  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD');

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(r => r.data),
  });

  const addCompany = useMutation({
    mutationFn: (d: { name: string; domain?: string }) => api.post('/companies', d),
    onSuccess: () => {
      toast.success('تم إضافة الشركة');
      setShowAddCompany(false);
      setNewCompanyName('');
      setNewCompanyDomain('');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('فشل إضافة الشركة'),
  });

  const addDept = useMutation({
    mutationFn: ({ companyId, name }: { companyId: string; name: string }) =>
      api.post('/companies/departments', { companyId, name }),
    onSuccess: () => {
      toast.success('تم إضافة القسم');
      setAddingDept(null);
      setNewDeptName('');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('فشل إضافة القسم'),
  });

  const addSystem = useMutation({
    mutationFn: ({ departmentId, name, description }: { departmentId: string; name: string; description?: string }) =>
      api.post('/companies/systems', { departmentId, name, description }),
    onSuccess: () => {
      toast.success('تم إضافة النظام');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('فشل إضافة النظام'),
  });

  const deleteSystem = useMutation({
    mutationFn: (id: string) => api.delete(`/companies/systems/${id}`),
    onSuccess: () => {
      toast.success('تم حذف النظام');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: () => toast.error('فشل حذف النظام'),
  });

  const companies: Company[] = data?.data || data || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">الشركات والأنظمة</h1>
          {canManage && (
            <button
              onClick={() => setShowAddCompany(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              + إضافة شركة
            </button>
          )}
        </div>

        {/* Add Company Modal */}
        {showAddCompany && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold mb-4">إضافة شركة جديدة</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">اسم الشركة</label>
                  <input
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="مثال: شركة الخليج للتقنية"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">النطاق (اختياري)</label>
                  <input
                    value={newCompanyDomain}
                    onChange={e => setNewCompanyDomain(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="example.com"
                    dir="ltr"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => addCompany.mutate({ name: newCompanyName, domain: newCompanyDomain || undefined })}
                    disabled={!newCompanyName.trim() || addCompany.isPending}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    إضافة
                  </button>
                  <button
                    onClick={() => { setShowAddCompany(false); setNewCompanyName(''); setNewCompanyDomain(''); }}
                    className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-gray-500 py-12">جارٍ التحميل...</div>
        ) : companies.length === 0 ? (
          <div className="text-center text-gray-400 py-12">لا توجد شركات مضافة</div>
        ) : (
          <div className="space-y-4">
            {companies.map(company => (
              <div key={company.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Company Header */}
                <button
                  onClick={() => setExpandedCompany(expandedCompany === company.id ? null : company.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-700 font-bold text-sm">
                      {company.name[0]}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{company.name}</div>
                      {company.domain && (
                        <div className="text-xs text-gray-500" dir="ltr">{company.domain}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>{company.departments?.length || 0} قسم</span>
                    <span className="text-gray-400">{expandedCompany === company.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Departments */}
                {expandedCompany === company.id && (
                  <div className="border-t border-gray-100 px-6 py-4 space-y-4">
                    {company.departments?.map(dept => (
                      <div key={dept.id} className="border border-gray-100 rounded-lg p-4">
                        <h3 className="font-medium text-gray-800 mb-3">{dept.name}</h3>
                        <div className="space-y-2">
                          {dept.systems?.map(sys => (
                            <SystemRow
                              key={sys.id}
                              system={sys}
                              deptId={dept.id}
                              onDelete={id => deleteSystem.mutate(id)}
                            />
                          ))}
                        </div>
                        {canManage && (
                          <div className="mt-2">
                            <AddSystemForm
                              deptId={dept.id}
                              onAdd={(name, desc) => addSystem.mutate({ departmentId: dept.id, name, description: desc || undefined })}
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    {canManage && (
                      <div className="pt-2">
                        {addingDept === company.id ? (
                          <div className="flex gap-2">
                            <input
                              value={newDeptName}
                              onChange={e => setNewDeptName(e.target.value)}
                              placeholder="اسم القسم الجديد"
                              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                              autoFocus
                            />
                            <button
                              onClick={() => addDept.mutate({ companyId: company.id, name: newDeptName })}
                              disabled={!newDeptName.trim() || addDept.isPending}
                              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                            >
                              إضافة
                            </button>
                            <button
                              onClick={() => { setAddingDept(null); setNewDeptName(''); }}
                              className="border border-gray-300 px-3 py-2 rounded-lg text-sm"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingDept(company.id)}
                            className="text-sm text-indigo-600 hover:underline"
                          >
                            + إضافة قسم
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

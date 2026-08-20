'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { usePermissions } from '@/hooks/usePermissions';
import { CompanyLogo } from '@/components/shared/CompanyLogo';
import { CodeComment } from '@/components/shared/CodeComment';
import { toast } from 'sonner';
import Link from 'next/link';
import { Building2, Camera, ChevronDown, ChevronUp, Pencil, Plus, X, Monitor, FolderOpen, ExternalLink } from 'lucide-react';

interface System { id: string; name: string; description?: string; isActive?: boolean; }
interface Department { id: string; name: string; }
interface Company { id: string; name: string; nameAr?: string; domain?: string; logoUrl?: string; departments: Department[]; systems: System[]; _count?: { users: number; tickets: number }; }

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all';
const inputStyle = { background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' };

export default function CompaniesPage() {
  const { can: allowed } = usePermissions();
  const queryClient = useQueryClient();
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyDomain, setNewCompanyDomain] = useState('');
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: '', nameAr: '', domain: '' });
  const [addingDept, setAddingDept] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [addingSystem, setAddingSystem] = useState<string | null>(null);
  const [editingSystem, setEditingSystem] = useState<string | null>(null);
  const [editSystemName, setEditSystemName] = useState('');
  const [newSystemName, setNewSystemName] = useState('');
  const [newSystemDesc, setNewSystemDesc] = useState('');

  // Capabilities, not role names — the same matrix the API gates on.
  const canManage = allowed('structure:manage');
  const canDeactivate = allowed('structure:deactivate');
  /** A cleared optional field goes back as null so the API drops the stored value. */
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);

  const handleLogoUpload = async (companyId: string, file: File) => {
    setUploadingLogoId(companyId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/companies/${companyId}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('تم تحديث الشعار');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    } catch { toast.error('فشل رفع الشعار'); }
    finally { setUploadingLogoId(null); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(r => r.data),
  });

  const addCompany = useMutation({
    mutationFn: (d: { name: string; domain?: string }) => api.post('/companies', d),
    onSuccess: () => { toast.success('تم إضافة الشركة'); setShowAddCompany(false); setNewCompanyName(''); setNewCompanyDomain(''); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل إضافة الشركة'),
  });

  const updateCompany = useMutation({
    mutationFn: ({ id, ...dto }: { id: string; name: string; nameAr: string | null; domain: string | null }) => api.patch(`/companies/${id}`, dto),
    onSuccess: () => { toast.success('تم تحديث بيانات الشركة'); setEditingCompany(null); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل تحديث بيانات الشركة'),
  });

  const editDept = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/departments/${id}`, { name }),
    onSuccess: () => { toast.success('تم تحديث اسم القسم'); setEditingDept(null); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل تحديث القسم'),
  });

  const addDept = useMutation({
    mutationFn: ({ companyId, name }: { companyId: string; name: string }) => api.post('/departments', { companyId, name }),
    onSuccess: () => { toast.success('تم إضافة القسم'); setAddingDept(null); setNewDeptName(''); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل إضافة القسم'),
  });

  const addSystem = useMutation({
    mutationFn: ({ companyId, name, description }: { companyId: string; name: string; description?: string }) => api.post('/systems', { companyId, name, description }),
    onSuccess: () => { toast.success('تم إضافة النظام'); setAddingSystem(null); setNewSystemName(''); setNewSystemDesc(''); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل إضافة النظام'),
  });

  // Systems are deactivated, never deleted — PATCH /activate turns them back on.
  const deactivateSystem = useMutation({
    mutationFn: (id: string) => api.patch(`/systems/${id}/deactivate`),
    onSuccess: () => { toast.success('تم تعطيل النظام'); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل تعطيل النظام'),
  });

  const activateSystem = useMutation({
    mutationFn: (id: string) => api.patch(`/systems/${id}/activate`),
    onSuccess: () => { toast.success('تم تفعيل النظام'); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل تفعيل النظام'),
  });

  const editSystem = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/systems/${id}`, { name }),
    onSuccess: () => { toast.success('تم تحديث اسم النظام'); setEditingSystem(null); queryClient.invalidateQueries({ queryKey: ['companies'] }); },
    onError: () => toast.error('فشل تحديث النظام'),
  });

  const companies: Company[] = data?.data || data || [];

  const startCompanyEdit = (company: Company) => {
    setCompanyForm({ name: company.name, nameAr: company.nameAr ?? '', domain: company.domain ?? '' });
    setEditingCompany(company.id);
  };

  return (
    <AppShell requires="structure:manage">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>الشركات والأنظمة</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{companies.length} شركة مسجلة</p>
          </div>
          {canManage && (
            <button onClick={() => setShowAddCompany(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              <Plus className="w-4 h-4" /> إضافة شركة
            </button>
          )}
        </div>

        {/* Add Company Modal */}
        {showAddCompany && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="palette-modal w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
              <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(79,70,229,0.12)' }}>
                    <Building2 className="w-5 h-5" style={{ color: '#4F46E5' }} />
                  </div>
                  <h2 className="font-bold text-base" style={{ color: 'var(--foreground)' }}>إضافة شركة جديدة</h2>
                </div>
                <button onClick={() => setShowAddCompany(false)} style={{ color: 'var(--muted-foreground)' }}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>اسم الشركة</label>
                  <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} className={inputCls} style={inputStyle} placeholder="مثال: شركة الخليج للتقنية"
                    onFocus={e => (e.target.style.borderColor = '#4F46E5')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>النطاق (اختياري)</label>
                  <input value={newCompanyDomain} onChange={e => setNewCompanyDomain(e.target.value)} className={inputCls} style={inputStyle} placeholder="example.com" dir="ltr"
                    onFocus={e => (e.target.style.borderColor = '#4F46E5')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => addCompany.mutate({ name: newCompanyName, domain: newCompanyDomain || undefined })}
                    disabled={!newCompanyName.trim() || addCompany.isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)' }}>
                    إضافة
                  </button>
                  <button onClick={() => { setShowAddCompany(false); setNewCompanyName(''); setNewCompanyDomain(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 font-brm text-sm" style={{ color: 'var(--muted-foreground)' }}>loading...</div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--muted-foreground)' }}>
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-brm text-sm">$ no companies found_</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map(company => (
              <div key={company.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                {/* Company Header */}
                <button onClick={() => setExpandedCompany(expandedCompany === company.id ? null : company.id)}
                  className="w-full flex items-center justify-between px-6 py-4 transition-colors text-right"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div className="flex items-center gap-3">
                    <div className="relative group/logo shrink-0">
                      <CompanyLogo company={company} size="md" />
                      {canManage && (
                        <>
                          <input type="file" accept="image/*" className="hidden"
                            ref={logoInputRef}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(company.id, f); e.target.value = ''; }} />
                          <button
                            onClick={e => { e.stopPropagation(); (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}
                            disabled={uploadingLogoId === company.id}
                            className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
                            style={{ background: 'rgba(0,0,0,0.55)' }}
                            title="تغيير الشعار">
                            <Camera className="w-3.5 h-3.5 text-white" />
                          </button>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{company.name}</div>
                      {company.domain && <div className="font-brm text-xs" style={{ color: 'var(--muted-foreground)' }} dir="ltr">{company.domain}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {company.departments?.length || 0} قسم</span>
                      <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {company.systems?.length || 0} نظام</span>
                      {company._count && <span>{company._count.users} مستخدم</span>}
                    </div>
                    <Link href={`/companies/${company.id}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{ color: '#4F46E5', background: 'rgba(79,70,229,0.08)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.08)')}>
                      <ExternalLink className="w-3 h-3" /> تذاكر الشركة
                    </Link>
                    {expandedCompany === company.id
                      ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />}
                  </div>
                </button>

                {/* Expanded Content */}
                {expandedCompany === company.id && (
                  <div className="px-6 py-5 space-y-6" style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Company details */}
                    <div>
                      <h3 className="font-brm text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--muted-foreground)' }}><CodeComment>بيانات الشركة</CodeComment></h3>
                      {editingCompany === company.id ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <label htmlFor={`company-name-${company.id}`} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>اسم الشركة</label>
                              <input id={`company-name-${company.id}`} value={companyForm.name} autoFocus
                                onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
                            </div>
                            <div>
                              <label htmlFor={`company-nameAr-${company.id}`} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الاسم بالعربية (اختياري)</label>
                              <input id={`company-nameAr-${company.id}`} value={companyForm.nameAr}
                                onChange={e => setCompanyForm(f => ({ ...f, nameAr: e.target.value }))}
                                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
                            </div>
                            <div>
                              <label htmlFor={`company-domain-${company.id}`} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>النطاق (اختياري)</label>
                              <input id={`company-domain-${company.id}`} value={companyForm.domain} dir="ltr"
                                onChange={e => setCompanyForm(f => ({ ...f, domain: e.target.value }))}
                                className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={inputStyle} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => updateCompany.mutate({ id: company.id, name: companyForm.name.trim(), nameAr: orNull(companyForm.nameAr), domain: orNull(companyForm.domain) })}
                              disabled={!companyForm.name.trim() || updateCompany.isPending}
                              className="px-4 py-2 rounded-xl text-sm text-white disabled:opacity-50" style={{ background: '#4F46E5' }}>حفظ</button>
                            <button onClick={() => setEditingCompany(null)}
                              className="px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap text-sm" style={{ color: 'var(--muted-foreground)' }}>
                          <span className="font-medium" style={{ color: 'var(--foreground)' }}>{company.name}</span>
                          {company.nameAr && company.nameAr !== company.name && <span>{company.nameAr}</span>}
                          {company.domain && <span className="font-brm" dir="ltr">{company.domain}</span>}
                          {canManage && (
                            <button onClick={() => startCompanyEdit(company)} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#4F46E5' }}>
                              <Pencil className="w-3.5 h-3.5" /> تعديل بيانات الشركة
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Departments */}
                    <div>
                      <h3 className="font-brm text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--muted-foreground)' }}><CodeComment>الأقسام</CodeComment></h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {company.departments?.length === 0
                          ? <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>لا توجد أقسام</span>
                          : company.departments?.map(dept => (
                              editingDept === dept.id ? (
                                <div key={dept.id} className="flex gap-2">
                                  <input value={editDeptName} onChange={e => setEditDeptName(e.target.value)}
                                    className="rounded-lg px-2 py-1 text-sm outline-none" style={inputStyle} autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter' && editDeptName.trim()) editDept.mutate({ id: dept.id, name: editDeptName.trim() }); if (e.key === 'Escape') setEditingDept(null); }} />
                                  <button onClick={() => editDept.mutate({ id: dept.id, name: editDeptName.trim() })} disabled={!editDeptName.trim() || editDept.isPending}
                                    className="px-3 py-1 rounded-lg text-xs text-white disabled:opacity-50" style={{ background: '#4F46E5' }}>حفظ</button>
                                  <button onClick={() => setEditingDept(null)}
                                    className="px-2 py-1 rounded-lg text-xs" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>إلغاء</button>
                                </div>
                              ) : (
                                <span key={dept.id} className="text-sm px-3 py-1 rounded-full inline-flex items-center gap-1.5"
                                  style={{ background: 'rgba(79,70,229,0.1)', color: '#6366F1', border: '1px solid rgba(79,70,229,0.2)' }}>
                                  {dept.name}
                                  {canManage && (
                                    <button onClick={() => { setEditingDept(dept.id); setEditDeptName(dept.name); }}
                                      aria-label={`تعديل القسم ${dept.name}`} title="تعديل القسم">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </span>
                              )
                            ))
                        }
                      </div>
                      {canManage && (
                        addingDept === company.id ? (
                          <div className="flex gap-2">
                            <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="اسم القسم الجديد"
                              className="rounded-xl px-3 py-2 text-sm flex-1 outline-none" style={inputStyle} autoFocus />
                            <button onClick={() => addDept.mutate({ companyId: company.id, name: newDeptName })} disabled={!newDeptName.trim()}
                              className="px-4 py-2 rounded-xl text-sm text-white disabled:opacity-50" style={{ background: '#4F46E5' }}>إضافة</button>
                            <button onClick={() => { setAddingDept(null); setNewDeptName(''); }}
                              className="px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>إلغاء</button>
                          </div>
                        ) : (
                          <button onClick={() => setAddingDept(company.id)} className="text-sm flex items-center gap-1" style={{ color: '#4F46E5' }}>
                            <Plus className="w-3.5 h-3.5" /> إضافة قسم
                          </button>
                        )
                      )}
                    </div>

                    {/* Systems */}
                    <div>
                      <h3 className="font-brm text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--muted-foreground)' }}><CodeComment>الأنظمة</CodeComment></h3>
                      <div className="space-y-2 mb-3">
                        {company.systems?.length === 0
                          ? <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>لا توجد أنظمة</span>
                          : company.systems?.map(sys => (
                              <div key={sys.id} className="flex items-center justify-between py-2 px-3 rounded-lg text-sm"
                                style={{ background: 'var(--muted)' }}>
                                {editingSystem === sys.id ? (
                                  <div className="flex gap-2 flex-1">
                                    <input value={editSystemName} onChange={e => setEditSystemName(e.target.value)}
                                      className="rounded-lg px-2 py-1 text-sm flex-1 outline-none" style={inputStyle} autoFocus
                                      onKeyDown={e => { if (e.key === 'Enter') editSystem.mutate({ id: sys.id, name: editSystemName }); if (e.key === 'Escape') setEditingSystem(null); }} />
                                    <button onClick={() => editSystem.mutate({ id: sys.id, name: editSystemName })} disabled={!editSystemName.trim()}
                                      className="px-3 py-1 rounded-lg text-xs text-white disabled:opacity-50" style={{ background: '#4F46E5' }}>حفظ</button>
                                    <button onClick={() => setEditingSystem(null)} className="px-2 py-1 rounded-lg text-xs" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>إلغاء</button>
                                  </div>
                                ) : (
                                  <>
                                    <div>
                                      <span className="font-medium" style={{ color: 'var(--foreground)' }}>{sys.name}</span>
                                      {sys.isActive === false && (
                                        <span className="text-xs mr-2 px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,.1)', color: '#DC2626' }}>غير نشط</span>
                                      )}
                                      {sys.description && <span className="text-xs mr-2" style={{ color: 'var(--muted-foreground)' }}>— {sys.description}</span>}
                                    </div>
                                    <div className="flex gap-3">
                                      {canManage && (
                                        <button onClick={() => { setEditingSystem(sys.id); setEditSystemName(sys.name); }} className="text-xs" style={{ color: '#4F46E5' }}>تعديل</button>
                                      )}
                                      {canDeactivate && sys.isActive !== false && (
                                        <button onClick={() => deactivateSystem.mutate(sys.id)} className="text-xs" style={{ color: '#EF4444' }}>تعطيل</button>
                                      )}
                                      {canDeactivate && sys.isActive === false && (
                                        <button onClick={() => activateSystem.mutate(sys.id)} className="text-xs" style={{ color: '#059669' }}>تفعيل</button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                        }
                      </div>
                      {canManage && (
                        addingSystem === company.id ? (
                          <div className="flex gap-2">
                            <input value={newSystemName} onChange={e => setNewSystemName(e.target.value)} placeholder="اسم النظام"
                              className="rounded-xl px-3 py-2 text-sm flex-1 outline-none" style={inputStyle} autoFocus />
                            <input value={newSystemDesc} onChange={e => setNewSystemDesc(e.target.value)} placeholder="وصف (اختياري)"
                              className="rounded-xl px-3 py-2 text-sm flex-1 outline-none" style={inputStyle} />
                            <button onClick={() => addSystem.mutate({ companyId: company.id, name: newSystemName, description: newSystemDesc || undefined })}
                              disabled={!newSystemName.trim()} className="px-4 py-2 rounded-xl text-sm text-white disabled:opacity-50" style={{ background: '#4F46E5' }}>إضافة</button>
                            <button onClick={() => { setAddingSystem(null); setNewSystemName(''); setNewSystemDesc(''); }}
                              className="px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>إلغاء</button>
                          </div>
                        ) : (
                          <button onClick={() => setAddingSystem(company.id)} className="text-sm flex items-center gap-1" style={{ color: '#4F46E5' }}>
                            <Plus className="w-3.5 h-3.5" /> إضافة نظام
                          </button>
                        )
                      )}
                    </div>
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

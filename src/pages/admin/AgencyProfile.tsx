import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, X } from 'lucide-react';

export default function AgencyProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: ''
  });

  const hasForm = useMemo(() => !!form.name, [form.name]);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agency_profile')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setForm({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          logo_url: data.logo_url || ''
        });
      } else {
        setForm({
          name: '',
          address: '',
          phone: '',
          email: '',
          website: '',
          logo_url: ''
        });
      }
    } catch (e: any) {
      toast.error('Gagal memuat profil: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toResizedDataUrl(file: File) {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsDataURL(file);
    });

    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('File gambar tidak valid.'));
      i.src = dataUrl;
    });

    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Gagal memproses gambar.');

    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  }

  async function handlePickLogo(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Ukuran logo maksimal 3 MB.');
      return;
    }
    try {
      const resized = await toResizedDataUrl(file);
      setForm(prev => ({ ...prev, logo_url: resized }));
    } catch (e: any) {
      toast.error(e.message || 'Gagal memproses logo.');
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nama instansi/bengkel wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_agency_profile_secure', {
        p_name: form.name,
        p_address: form.address || null,
        p_phone: form.phone || null,
        p_email: form.email || null,
        p_website: form.website || null,
        p_logo_url: form.logo_url || null
      });

      if (error) throw error;
      toast.success('Profil berhasil disimpan.');
      await fetchProfile();
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Profil Instansi</h2>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pengaturan Profil</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchProfile} disabled={loading || saving}>
              Muat Ulang
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat profil...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Instansi / Bengkel</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Contoh: OtoSmart Workshop"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alamat</Label>
                  <Textarea
                    value={form.address}
                    onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Alamat lengkap..."
                    className="min-h-[96px]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telepon</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="08xx / (031) ..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={form.email}
                      onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="email@domain.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={form.website}
                    onChange={(e) => setForm(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://otosmart.site"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo Bengkel</Label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePickLogo(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={saving}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Logo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                      disabled={saving || !form.logo_url}
                      className="flex items-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      Hapus
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Format PNG/JPG. Akan otomatis diperkecil (maks 512px).
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {form.logo_url ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={form.logo_url}
                        alt="Logo"
                        className="h-20 w-20 rounded-lg bg-white border border-slate-200 object-contain"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {hasForm ? form.name : 'Logo Preview'}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          Logo akan muncul di halaman cetak (PO, Entry, dll).
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      Belum ada logo. Upload logo untuk ditampilkan pada kop surat cetak.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

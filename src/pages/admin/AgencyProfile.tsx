import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Building2, Upload, Pencil, X } from 'lucide-react';

type AgencyProfile = Database['public']['Tables']['agency_profile']['Row'];

export default function AgencyProfilePage() {
  const [profile, setProfile] = useState<AgencyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data, error } = await supabase
        .from('agency_profile')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is no rows found

      if (data) {
        setProfile(data);
        setFormData({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          website: data.website || '',
          logo_url: data.logo_url || ''
        });
      }
    } catch (error: any) {
      toast.error('Gagal mengambil profil instansi: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        logo_url: formData.logo_url,
        updated_at: new Date().toISOString()
      };

      if (profile) {
        // Update
        const { error, data } = await supabase
          .from('agency_profile')
          .update(payload)
          .eq('id', profile.id)
          .select(); // Returns array
          
        if (error) throw error;
        
        if (data && data.length > 0) {
            const updatedProfile = data[0];
            setProfile(updatedProfile); // Update local state immediately
            setFormData({
                name: updatedProfile.name || '',
                address: updatedProfile.address || '',
                phone: updatedProfile.phone || '',
                email: updatedProfile.email || '',
                website: updatedProfile.website || '',
                logo_url: updatedProfile.logo_url || ''
            });
        }
        
        toast.success('Profil Instansi diperbarui');
      } else {
        // Insert
        const { error, data } = await supabase
          .from('agency_profile')
          .insert([payload])
          .select(); // Returns array

        if (error) throw error;
        
        if (data && data.length > 0) {
            setProfile(data[0]);
        }
        
        toast.success('Profil Instansi dibuat');
      }
      
      // fetchProfile(); // Remove fetch to avoid race condition or stale data
      setIsEditing(false);
    } catch (error: any) {
      toast.error('Gagal menyimpan: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEdit = () => {
    if (isEditing) {
      // Cancel edit - reset form
      if (profile) {
        setFormData({
          name: profile.name || '',
          address: profile.address || '',
          phone: profile.phone || '',
          email: profile.email || '',
          website: profile.website || '',
          logo_url: profile.logo_url || ''
        });
      }
    }
    setIsEditing(!isEditing);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Profil Instansi (Kop Surat)</h2>
          <p className="text-muted-foreground">
            Atur data instansi yang akan ditampilkan pada Kop Surat di semua laporan cetak.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={toggleEdit} variant="outline" className="gap-2">
            <Pencil className="h-4 w-4" /> Ubah Profil
          </Button>
        )}
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Data Instansi
            </CardTitle>
            <CardDescription>
              Informasi ini akan muncul di bagian atas (Header) setiap dokumen cetak.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Instansi (Judul Kop)</Label>
                <Input 
                  id="name" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleInputChange} 
                  placeholder="Contoh: PT. MAJU JAYA ABADI" 
                  required 
                  className="font-bold text-lg"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Alamat Lengkap</Label>
                <Input 
                  id="address" 
                  name="address" 
                  value={formData.address} 
                  onChange={handleInputChange} 
                  placeholder="Contoh: Jl. Jend. Sudirman No. 123, Jakarta Selatan" 
                  disabled={!isEditing}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Nomor Telepon</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    value={formData.phone} 
                    onChange={handleInputChange} 
                    placeholder="Contoh: (021) 555-0123" 
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    value={formData.email} 
                    onChange={handleInputChange} 
                    placeholder="Contoh: info@majujaya.co.id" 
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website (Opsional)</Label>
                <Input 
                  id="website" 
                  name="website" 
                  value={formData.website} 
                  onChange={handleInputChange} 
                  placeholder="Contoh: www.majujaya.co.id" 
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo_url">URL Logo Instansi</Label>
                <div className="flex gap-2">
                  <Input 
                    id="logo_url" 
                    name="logo_url" 
                    value={formData.logo_url} 
                    onChange={handleInputChange} 
                    placeholder="https://..." 
                    disabled={!isEditing}
                  />
                  {formData.logo_url && (
                    <div className="h-10 w-10 border rounded overflow-hidden bg-gray-50 flex items-center justify-center">
                      <img src={formData.logo_url} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Masukkan URL gambar logo (harus public access).</p>
              </div>
            </div>

            {isEditing && (
              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={toggleEdit} disabled={saving}>
                  <X className="mr-2 h-4 w-4" /> Batal
                </Button>
                <Button type="submit" disabled={saving || loading}>
                  {saving ? 'Menyimpan...' : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Simpan Perubahan
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

import { supabase } from './supabase';
import { Kelurahan, RW, RT, UserProfile, Profile, FamilyMember, HouseholdSavePayload, Rumah, KartuKeluarga, JawabanKuesioner } from '@/types';
import { mockApi } from './mockApi';

// Evaluate mock mode at runtime so presence of `mock_session` in localStorage
// takes immediate effect without reloading module scope constants.
const isMockMode = () => {
  try {
    return import.meta.env.VITE_USE_MOCK === 'true' || !!localStorage.getItem('mock_session');
  } catch (e) {
    return import.meta.env.VITE_USE_MOCK === 'true';
  }
};
// const USE_MOCK = true; // FORCE ON

// Profile API
export const getPKMProfile = async (skipFallback: boolean = false) => {
  if (isMockMode()) return mockApi.getPKMProfile();
  
  try {
    const { data, error } = await supabase.from('pkm_profile').select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Data profil kosong di server');
    return data as Profile;
  } catch (error) {
    if (skipFallback) throw error;
    
    console.warn("Supabase fetch failed, trying localStorage backup...", error);
    // Fallback to localStorage
    const backup = localStorage.getItem('pkm_profile_v1');
    if (backup) {
      return JSON.parse(backup) as Profile;
    }
    throw error;
  }
};

export const updatePKMProfile = async (profile: Partial<Profile>) => {
  if (isMockMode()) return mockApi.updatePKMProfile(profile);

  // Ensure ID is present for UPSERT to work as UPDATE, otherwise it tries to INSERT
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
  const profileToSave = { ...profile };
  
  // Use existing ID if provided, otherwise use Singleton
  if (!profileToSave.id) {
     const { data: existing } = await supabase.from('pkm_profile').select('id').limit(1).maybeSingle();
     profileToSave.id = existing?.id || SINGLETON_ID; 
  }

  // Use UPSERT instead of update to handle the case where the record doesn't exist yet
  const { error } = await supabase.from('pkm_profile').upsert(profileToSave, {
    onConflict: 'id'
  });
  if (error) {
     console.error("Save Error:", error);
     throw error;
  }
};

// Location API
export const getKelurahans = async () => {
  if (isMockMode()) return mockApi.getKelurahans();
  const { data, error } = await supabase.from('kelurahan').select('*').order('name');
  if (error) throw error;
  return data as Kelurahan[];
};

export const createKelurahan = async (name: string) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_kelurahan') || '[]');
    const mockNew = { id: Date.now(), name };
    current.push(mockNew);
    localStorage.setItem('mock_kelurahan', JSON.stringify(current));
    return mockNew;
  }
  const { data, error } = await supabase.from('kelurahan').insert({ name }).select().single();
  if (error) throw error;
  return data;
};

export const updateKelurahan = async (id: number, name: string) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_kelurahan') || '[]');
    const updated = current.map((k: any) => k.id === id ? { ...k, name } : k);
    localStorage.setItem('mock_kelurahan', JSON.stringify(updated));
    return;
  }
  const { error } = await supabase.from('kelurahan').update({ name }).eq('id', id);
  if (error) throw error;
};

export const deleteLocation = async (table: string, id: number) => {
  if (isMockMode()) {
    const key = `mock_${table}`;
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = current.filter((i: any) => i.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));
    return;
  }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
};

export const getRWs = async (kelurahanId: number) => {
  if (isMockMode()) return mockApi.getRWs(kelurahanId);
  const { data, error } = await supabase.from('rw').select('*').eq('kelurahan_id', kelurahanId).order('name');
  if (error) throw error;
  
  // Sort numerically (1, 2, 10 instead of 1, 10, 2)
  return (data as RW[]).sort((a, b) => 
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
};

export const getAllRWs = async () => {
  if (isMockMode()) {
    const kData = await mockApi.getKelurahans();
    const rwData = JSON.parse(localStorage.getItem('mock_rw') || '[]');
    return rwData.map((r: any) => ({ ...r, kelurahan: kData.find((k: any) => String(k.id) === String(r.kelurahan_id)) }));
  }
  const { data, error } = await supabase.from('rw').select('*, kelurahan(name)').order('name');
  if (error) throw error;
  return data;
}

export const createRW = async (name: string, kelurahan_id: number) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_rw') || '[]');
    const mockNew = { id: Date.now(), name, kelurahan_id };
    current.push(mockNew);
    localStorage.setItem('mock_rw', JSON.stringify(current));
    return mockNew;
  }
  const { data, error } = await supabase.from('rw').insert({ name, kelurahan_id }).select().single();
  if (error) throw error;
  return data;
};

export const updateRW = async (id: number, name: string, kelurahan_id: number) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_rw') || '[]');
    const updated = current.map((r: any) => r.id === id ? { ...r, name, kelurahan_id } : r);
    localStorage.setItem('mock_rw', JSON.stringify(updated));
    return;
  }
  const { error } = await supabase.from('rw').update({ name, kelurahan_id }).eq('id', id);
  if (error) throw error;
};

export const getRTs = async (rwId: number) => {
  if (isMockMode()) return mockApi.getRTs(rwId);
  const { data, error } = await supabase.from('rt').select('*').eq('rw_id', rwId).order('name');
  if (error) throw error;
  
  // Sort numerically
  return (data as RT[]).sort((a, b) => 
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
};

export const getAllRTs = async () => {
  if (isMockMode()) {
    const kData = await mockApi.getKelurahans();
    const rwData = JSON.parse(localStorage.getItem('mock_rw') || '[]');
    const rtData = JSON.parse(localStorage.getItem('mock_rt') || '[]');
    const enrichedRWs = rwData.map((r: any) => ({ ...r, kelurahan: kData.find((k: any) => String(k.id) === String(r.kelurahan_id)) }));
    return rtData.map((r: any) => ({ ...r, rw: enrichedRWs.find((rw: any) => String(rw.id) === String(r.rw_id)) }));
  }
  const { data, error } = await supabase.from('rt').select('*, rw(name, kelurahan_id, kelurahan(name))').order('name');
  if (error) throw error;
  return data;
}

export const createRT = async (name: string, rw_id: number) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_rt') || '[]');
    const mockNew = { id: Date.now(), name, rw_id };
    current.push(mockNew);
    localStorage.setItem('mock_rt', JSON.stringify(current));
    return mockNew;
  }
  const { data, error } = await supabase.from('rt').insert({ name, rw_id }).select().single();
  if (error) throw error;
  return data;
};

export const updateRT = async (id: number, name: string, rw_id: number) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_rt') || '[]');
    const updated = current.map((r: any) => r.id === id ? { ...r, name, rw_id } : r);
    localStorage.setItem('mock_rt', JSON.stringify(updated));
    return;
  }
  const { error } = await supabase.from('rt').update({ name, rw_id }).eq('id', id);
  if (error) throw error;
};

const KUESIONER_FIELDS = [
  'p1_1','p1_2','p1_3','p1_4','p1_5','p1_6','p1_7',
  'p2_1','p2_2','p2_3','p2_4','p2_5','p2_6','p2_7','p2_8',
  'p3_1','p3_2','p3_3','p3_4','p3_5','p3_6','p3_7','p3_8','p3_9','p3_10','p3_11','p3_12','p3_13','p3_14',
  'p4_1','p4_2','p4_3','p4_4',
  'p5_1','p5_2','p5_3','p5_4','p5_5','p5_6','p5_7','p5_8','p5_9'
] as const;

const normalizeKuesionerPayload = (source: Record<string, boolean | null> = {}) => {
  const output: Record<string, boolean | null> = {};

  for (const field of KUESIONER_FIELDS) {
    const value = source[field];
    if (value === true || value === false) {
      output[field] = value;
    } else {
      output[field] = null;
    }
  }

  return output;
};

export const createRumah = async (rumah: Partial<Rumah>) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_rumah') || '[]');
    const created = { id: crypto.randomUUID(), ...rumah, created_at: new Date().toISOString() };
    current.push(created);
    localStorage.setItem('mock_rumah', JSON.stringify(current));
    return created;
  }

  const { data, error } = await supabase.from('rumah').insert([rumah]).select().single();
  if (error) throw error;
  return data as Rumah;
};

export const createKK = async (kk: Partial<KartuKeluarga>) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_kk') || '[]');
    const created = { id: crypto.randomUUID(), ...kk, created_at: new Date().toISOString() };
    current.push(created);
    localStorage.setItem('mock_kk', JSON.stringify(current));
    return created;
  }

  const { data, error } = await supabase.from('kk').insert([kk]).select().single();
  if (error) throw error;
  return data as KartuKeluarga;
};

export const createJawabanKuesioner = async (jawaban: Partial<JawabanKuesioner>) => {
  if (isMockMode()) {
    const current = JSON.parse(localStorage.getItem('mock_jawaban_kuesioner') || '[]');
    const created = { id: crypto.randomUUID(), ...jawaban, created_at: new Date().toISOString() };
    current.push(created);
    localStorage.setItem('mock_jawaban_kuesioner', JSON.stringify(current));
    return created;
  }

  const { data, error } = await supabase.from('jawaban_kuesioner').insert([jawaban]).select().single();
  if (error) throw error;
  return data as JawabanKuesioner;
};

export const saveHouseholdData = async (payload: HouseholdSavePayload) => {
  if (isMockMode()) {
    const rumah = { id: crypto.randomUUID(), ...payload.rumah, created_at: new Date().toISOString() };
    const kkList: any[] = [];
    const jawabanList: any[] = [];

    for (const item of payload.kk_list) {
      const kk = {
        id: crypto.randomUUID(),
        nomor_kk: item.nomor_kk,
        kepala_keluarga: item.kepala_keluarga,
        id_rumah: rumah.id,
        created_at: new Date().toISOString()
      };
      kkList.push(kk);

      const normalized = normalizeKuesionerPayload(item.jawaban_kuesioner || {});
      const jawaban = {
        id: crypto.randomUUID(),
        id_kk: kk.id,
        ...normalized,
        created_at: new Date().toISOString()
      };
      jawabanList.push(jawaban);
    }

    const households = JSON.parse(localStorage.getItem('mock_rumah') || '[]');
    households.push(rumah);
    localStorage.setItem('mock_rumah', JSON.stringify(households));

    const familyList = JSON.parse(localStorage.getItem('mock_kk') || '[]');
    familyList.push(...kkList);
    localStorage.setItem('mock_kk', JSON.stringify(familyList));

    const answerList = JSON.parse(localStorage.getItem('mock_jawaban_kuesioner') || '[]');
    answerList.push(...jawabanList);
    localStorage.setItem('mock_jawaban_kuesioner', JSON.stringify(answerList));

    return { rumah, kk: kkList, jawaban_kuesioner: jawabanList };
  }

  const { data: rumahData, error: rumahError } = await supabase
    .from('rumah')
    .insert([payload.rumah])
    .select()
    .single();

  if (rumahError) throw rumahError;

  const createdKK: any[] = [];
  const createdAnswers: any[] = [];

  for (const item of payload.kk_list) {
    const { data: kkData, error: kkError } = await supabase
      .from('kk')
      .insert([
        {
          nomor_kk: item.nomor_kk,
          kepala_keluarga: item.kepala_keluarga,
          id_rumah: rumahData.id
        }
      ])
      .select()
      .single();

    if (kkError) throw kkError;
    createdKK.push(kkData);

    const normalized = normalizeKuesionerPayload(item.jawaban_kuesioner || {});
    const { data: answerData, error: answerError } = await supabase
      .from('jawaban_kuesioner')
      .insert([
        {
          id_kk: kkData.id,
          ...normalized
        }
      ])
      .select()
      .single();

    if (answerError) throw answerError;
    createdAnswers.push(answerData);
  }

  return {
    rumah: rumahData,
    kk: createdKK,
    jawaban_kuesioner: createdAnswers
  };
};

export const getRumahDetail = async (id: string) => {
  if (isMockMode()) {
    const rumahList = JSON.parse(localStorage.getItem('mock_rumah') || '[]');
    const kkList = JSON.parse(localStorage.getItem('mock_kk') || '[]');
    const answerList = JSON.parse(localStorage.getItem('mock_jawaban_kuesioner') || '[]');

    const rumah = rumahList.find((item: any) => item.id === id);
    if (!rumah) throw new Error('Rumah tidak ditemukan');

    const kk = kkList.filter((item: any) => item.id_rumah === id);
    return {
      ...rumah,
      kk_list: kk.map((item: any) => ({
        ...item,
        jawaban_kuesioner: answerList.find((answer: any) => answer.id_kk === item.id) || null
      })),
      rt: null,
      rw: null,
      kelurahan: null
    };
  }

  const { data: rumahData, error: rumahError } = await supabase
    .from('rumah')
    .select('*')
    .eq('id', id)
    .single();

  if (rumahError) throw rumahError;

  const { data: kkData, error: kkError } = await supabase
    .from('kk')
    .select('*')
    .eq('id_rumah', id)
    .order('created_at', { ascending: false });

  if (kkError) throw kkError;

  const kkIds = (kkData || []).map((item) => item.id);
  let answers: any[] = [];

  if (kkIds.length > 0) {
    const { data: answerData, error: answerError } = await supabase
      .from('jawaban_kuesioner')
      .select('*')
      .in('id_kk', kkIds);

    if (answerError) throw answerError;
    answers = answerData || [];
  }

  const answerMap = new Map((answers || []).map((item) => [item.id_kk, item]));

  let rtData: any = null;
  let rwData: any = null;
  let kelurahanData: any = null;

  if (rumahData?.id_rt) {
    const { data: rtQueryData, error: rtError } = await supabase
      .from('rt')
      .select('*')
      .eq('id', rumahData.id_rt)
      .maybeSingle();

    if (rtError) throw rtError;
    rtData = rtQueryData;

    if (rtData?.rw_id) {
      const { data: rwQueryData, error: rwError } = await supabase
        .from('rw')
        .select('*')
        .eq('id', rtData.rw_id)
        .maybeSingle();

      if (rwError) throw rwError;
      rwData = rwQueryData;

      if (rwData?.kelurahan_id) {
        const { data: kelurahanQueryData, error: kelurahanError } = await supabase
          .from('kelurahan')
          .select('*')
          .eq('id', rwData.kelurahan_id)
          .maybeSingle();

        if (kelurahanError) throw kelurahanError;
        kelurahanData = kelurahanQueryData;
      }
    }
  }

  return {
    ...rumahData,
    rt: rtData,
    rw: rwData,
    kelurahan: kelurahanData,
    kk_list: (kkData || []).map((item) => ({
      ...item,
      jawaban_kuesioner: answerMap.get(item.id) || null
    }))
  };
};

export const getAllRumahDetail = async () => {
  if (isMockMode()) {
    return JSON.parse(localStorage.getItem('mock_rumah') || '[]');
  }

  const { data: rumahList, error } = await supabase
    .from('rumah')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return rumahList || [];
};

// User API
export const getUsers = async () => {
  if (isMockMode()) return mockApi.getUsers();
  
  // 1. Fetch Users Profile
  const { data: users, error: userError } = await supabase.from('user_profiles').select(`
    *,
    kelurahan:kelurahan_id(name),
    rw:rw_id(name),
    rt:rt_id(name)
  `).order('created_at', { ascending: false });
  
  if (userError) throw userError;

  // 2. Fetch User RTs (Manual Join because relation is missing in PostgREST cache)
  // We fetch ALL user_rts assignments and join them in JS.
  // This is safer than relying on Supabase auto-join which is fragile to schema cache.
  const { data: userRts, error: rtError } = await supabase.from('user_rts').select(`
    user_id,
    rt_id,
    rt:rt_id(name)
  `);

  if (rtError) {
    console.warn('Failed to fetch user_rts assignments, continuing without them', rtError);
    return users;
  }

  // 3. Map assignments to users
  return users.map(user => {
    const assignments = userRts.filter((ur: any) => ur.user_id === user.id);
    return {
      ...user,
      user_rts: assignments
    };
  });
};

export const createUserProfile = async (user: Partial<UserProfile>) => {
  if (isMockMode()) return mockApi.createUserProfile(user);
  const { data, error } = await supabase.from('user_profiles').upsert(user).select().single();
  if (error) throw error;
  return data;
};

export const deleteUser = async (id: string) => {
  if (isMockMode()) {
    const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
    const newUsers = users.filter((u: any) => u.id !== id);
    localStorage.setItem('mock_users', JSON.stringify(newUsers));
    return;
  }
  
  // Note: This only deletes the profile. Deleting the Auth user requires Service Role (backend).
  // But we can mark it deleted or try.
  const { error } = await supabase.from('user_profiles').delete().eq('id', id);
  if (error) throw error;
};

export const updateUserStatus = async (id: string, isActive: boolean) => {
  if (isMockMode()) return mockApi.updateUserStatus(id, isActive);
  const { error } = await supabase.from('user_profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
};

// New: Function to call Backend (Edge Function) for Password Update
export const adminUpdatePassword = async (userId: string, newPassword: string) => {
  if (isMockMode()) return;
  
  console.log('Attempting to update password for user:', userId);
  
  try {
    const { data, error } = await supabase.functions.invoke('admin-update-user', {
      body: { userId, password: newPassword }
    });

    if (error) {
      console.error('Edge Function Error:', error);
      
      let errorMessage = error.message;

      // Check if we can extract a better message from the function's response
      if (error.context && typeof error.context.json === 'function') {
        try {
          const errorData = await error.context.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // If JSON parsing fails, the body might be plain text
          try {
            const text = await error.context.text();
            if (text) errorMessage = text;
          } catch (textErr) {
             console.warn('Could not parse error response body', textErr);
          }
        }
      }
      
      // Map generic "non-2xx" to something more helpful
      if (errorMessage.includes('non-2xx')) {
        errorMessage = `Gagal terhubung ke server (Status: 400/500). 
        
HAL INI BIASANYA KARENA:
1. Sesi login Anda habis (Silakan Logout lalu Login lagi).
2. Perubahan kode belum di-deploy ke Supabase.
3. Service Role Key belum diset di Supabase dashboard.

Info raw: ${errorMessage}`;
      }

      throw new Error(errorMessage);
    }
    
    console.log('Password update successful:', data);
    return data;
  } catch (err: any) {
    console.error('adminUpdatePassword error:', err);
    
    // Handle network errors
    if (err.message && (err.message.includes('fetch') || err.message.includes('network'))) {
      throw new Error('Gagal menghubungi server. Periksa koneksi internet Anda.');
    }
    
    throw err;
  }
};

export const adminDeleteUser = async (userId: string) => {
  if (isMockMode()) return;
  
  const { data, error } = await supabase.functions.invoke('admin-update-user', {
    body: { userId, action: 'delete' }
  });

  if (error) {
    console.error('Edge Function Error:', error);
    let errorMessage = error.message;
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errorData = await error.context.json();
        if (errorData && errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        console.warn('Could not parse error response body', e);
      }
    }
    throw new Error(errorMessage);
  }
  
  return data;
};

// NOTE: Password update removed from frontend as it requires Service Role (Secret Key)
// which should NEVER be placed in a frontend app for security reasons.
// To change password, admin should delete and recreate the kader.

export const deleteEntry = async (id: string) => {
  if (isMockMode()) {
    const entries = JSON.parse(localStorage.getItem('mock_entries') || '[]');
    const newEntries = entries.filter((e: any) => e.id !== id);
    localStorage.setItem('mock_entries', JSON.stringify(newEntries));
    
    const family = JSON.parse(localStorage.getItem('mock_family') || '[]');
    const newFamily = family.filter((f: any) => f.entry_id !== id);
    localStorage.setItem('mock_family', JSON.stringify(newFamily));
    return;
  }

  // JURUS 1: COBA PAKAI RPC (Server Function) - Paling Kuat
  try {
    const { error: rpcError } = await supabase.rpc('delete_entry_fully', { target_entry_id: id });
    if (!rpcError) {
      console.log("Berhasil hapus via RPC");
      return; // Sukses!
    }
    console.warn("Gagal hapus via RPC, mencoba cara manual...", rpcError);
  } catch (e) {
    console.warn("RPC Error exception", e);
  }

  // JURUS 2: CARA MANUAL (Fallback jika RPC belum dibuat di database)
  // 1. Delete family members first
  const { error: fmError } = await supabase.from('family_members').delete().eq('entry_id', id);
  if (fmError) {
    console.warn("Gagal menghapus family_members (Manual):", fmError);
  }

  // 2. Delete entry
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) {
     console.error("Gagal menghapus entry:", error);
     throw new Error(`Gagal menghapus data. Mohon jalankan script 'force_delete_function.sql' di Supabase. Detail: ${error.message}`);
  }
};

export const checkDuplicateKK = async (kkNumber: string, excludeEntryId?: string) => {
  if (isMockMode()) {
    const family = JSON.parse(localStorage.getItem('mock_family') || '[]');
    return family.some((f: any) => f.kk_number === kkNumber && f.entry_id !== excludeEntryId);
  }

  const { data, error } = await supabase
    .from('family_members')
    .select('id, entry_id')
    .eq('kk_number', kkNumber)
    .limit(1);

  if (error) return false;
  if (data && data.length > 0) {
    // If it's the same entry, it's not a duplicate for "update" purposes
    if (excludeEntryId && data[0].entry_id === excludeEntryId) return false;
    return true;
  }
  return false;
};

// Helper to safely resolve RT/RW IDs from either UUID or Name
async function resolveLocationId(
  type: 'rw' | 'rt',
  parentId: string | number, // kelurahan_id for rw, rw_id for rt
  nameOrId: string | number
): Promise<string> {
  const input = String(nameOrId).trim();
  
  // 1. If it's already a UUID, return it
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  if (isUUID) return input;

  // 2. Validate input name
  if (!input || input === '0' || input === 'NaN' || input.toLowerCase() === 'null') {
    throw new Error(`Nama ${type.toUpperCase()} tidak valid (${input})`);
  }

  const parentField = type === 'rw' ? 'kelurahan_id' : 'rw_id';
  
  // 3. Try lookup by name (exact)
  const { data: exactMatch } = await supabase
    .from(type)
    .select('id')
    .eq(parentField, parentId)
    .eq('name', input)
    .maybeSingle();
  if (exactMatch) return exactMatch.id;

  // 4. Try lookup by name (padded with leading zero)
  const padded = input.padStart(2, '0');
  if (padded !== input) {
    const { data: paddedMatch } = await supabase
      .from(type)
      .select('id')
      .eq(parentField, parentId)
      .eq('name', padded)
      .maybeSingle();
    if (paddedMatch) return paddedMatch.id;
  }

  // 5. If not found, create new
  const { data: created } = await supabase
    .from(type)
    .insert({ [parentField]: parentId, name: input })
    .select('id')
    .maybeSingle();

  if (created) return created.id;

  // 6. If insert failed (likely race condition), try lookup one last time
  const { data: retryMatch } = await supabase
    .from(type)
    .select('id')
    .eq(parentField, parentId)
    .eq('name', input)
    .maybeSingle();
  if (retryMatch) return retryMatch.id;

  if (padded !== input) {
    const { data: retryPaddedMatch } = await supabase
      .from(type)
      .select('id')
      .eq(parentField, parentId)
      .eq('name', padded)
      .maybeSingle();
    if (retryPaddedMatch) return retryPaddedMatch.id;
  }

  throw new Error(`Gagal memproses data ${type.toUpperCase()}: ${input}. Silakan periksa kembali data wilayah.`);
}

// Entry API
export const createEntry = async (entryData: any) => {
  if (isMockMode()) return mockApi.createEntry(entryData);

  // Strip out joined data that aren't columns in 'entries' table
  // ALSO remove deprecated columns that are now in family_members
  const { 
    family_members: _fm, 
    kelurahan: _k, 
    rw: _rw, 
    rt: _rt, 
    kader: _kd, 
    head_of_family: _hof, // Remove deprecated
    total_souls: _ts,     // Remove deprecated
    latrine_count: _lc,   // Remove deprecated
    ...cleanData 
  } = entryData;
  
  try {
    let finalRwId = cleanData.rw_id;
    let finalRtId = cleanData.rt_id;

    // Resolve RW
    if (cleanData.rw_id && cleanData.kelurahan_id) {
      finalRwId = await resolveLocationId('rw', cleanData.kelurahan_id, cleanData.rw_id);
    }

    // Resolve RT
    if (cleanData.rt_id && finalRwId) {
      finalRtId = await resolveLocationId('rt', finalRwId, cleanData.rt_id);
    }

    const { data, error } = await supabase
      .from('entries')
      .insert([{...cleanData, rw_id: finalRwId, rt_id: finalRtId}])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error in createEntry:', error);
    throw error;
  }
};

export const createFamilyMembers = async (members: Partial<FamilyMember>[]) => {
  if (isMockMode()) return mockApi.createFamilyMembers(members);
  
  // Strictly only send columns that exist in the DB schema
  // total_souls, permanent_souls, and latrine_count are included as they are core metrics
  const cleanMembers = members.map((m: any) => ({
    entry_id: m.entry_id,
    kk_number: m.kk_number,
    head_of_family: m.head_of_family,
    total_souls: Number(m.total_souls || 0),
    permanent_souls: Number(m.permanent_souls || 0),
    latrine_count: Number(m.latrine_count || 0)
  }));
  
  const { data, error } = await supabase.from('family_members').insert(cleanMembers).select();
  if (error) throw error;
  return data;
};

export const getUserEntries = async (userId: string, isAdmin: boolean = false, dateFrom?: string, dateTo?: string) => {
  if (isMockMode()) return mockApi.getUserEntries(userId);
  
  let query = supabase.from('entries')
    .select(`
      *,
      kelurahan:kelurahan_id(name),
      rw:rw_id(name),
      rt:rt_id(name),
      family_members(*),
      kader:user_profiles!user_id(name)
    `);

  // Jika bukan admin, filter berdasarkan userId
  // Super Admin can see ALL data, so we don't filter by user_id if isAdmin is true
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  // Filter Tanggal di Server (Supabase) untuk optimasi loading
  if (dateFrom) {
    query = query.gte('date_entry', dateFrom);
  }
  if (dateTo) {
    // Make sure we include the entire end date by adding time or using next day
    query = query.lte('date_entry', dateTo);
  }

  // FORCE RETURN DATA TO DEBUG
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
      console.error("getUserEntries Error (Complex Join):", error);
      
      // FALLBACK: Try fetching entries without joins to diagnose if it's an RLS issue on related tables
      console.warn("Attempting fallback fetch (raw entries only)...");
      const { data: rawData, error: rawError } = await supabase
        .from('entries')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (!rawError && rawData) {
          console.log("Fallback fetch success! Found entries:", rawData.length);
          // Return raw data with empty relations to at least show something
          return rawData.map(e => ({
              ...e,
              kelurahan: { name: 'Loading...' },
              rw: { name: '?' },
              rt: { name: '?' },
              family_members: [], // This explains why head_of_family is missing
              kader: { name: '?' }
          }));
      }
      
      throw error;
  }
  
  // Debug: Log what we found
  console.log(`API DEBUG: Found ${data?.length || 0} entries. Params: userId=${userId}, isAdmin=${isAdmin}, date=${dateFrom}-${dateTo}`);
  
  return data || []; // Ensure we always return an array
};

// Specialized API for Reporting (Optimized Columns)
export const getReportEntries = async (userId: string, isAdmin: boolean = false, dateFrom?: string, dateTo?: string) => {
  if (isMockMode()) return mockApi.getUserEntries(userId);

  // Select only necessary columns for reporting to reduce payload size
  let query = supabase.from('entries')
    .select(`
      id,
      kelurahan_id,
      kelurahan:kelurahan_id(name),
      family_members!entry_id(id),
      total_souls,
      latrine_count,
      jamban_bab_jamban,
      jamban_milik_sendiri,
      jamban_leher_angsa,
      jamban_septik_aman,
      jamban_septik_tidak_sedot,
      jamban_cubluk,
      jamban_dibuang_drainase,
      ctps_sarana,
      ctps_air_mengalir,
      ctps_sabun,
      ctps_mampu_praktek,
      ctps_sebelum_makan,
      ctps_sebelum_olah_makan,
      ctps_sebelum_susui,
      ctps_setelah_bab,
      air_layak_perpipaan,
      air_layak_kran_umum,
      air_layak_sg_terlindung,
      air_layak_sgl,
      air_layak_spl,
      air_layak_mata_air,
      air_layak_hujan,
      olah_air_proses,
      olah_air_simpan_tutup,
      pangan_tutup,
      pangan_pisah_b3,
      pangan_5_kunci,
      sampah_tidak_serak,
      sampah_tutup_kuat,
      sampah_olah_aman,
      sampah_pilah,
      limbah_tidak_genang,
      limbah_saluran_kedap,
      limbah_resapan_ipal,
      pkurt_jendela_kamar,
      pkurt_jendela_keluarga,
      pkurt_ventilasi,
      pkurt_lubang_asap,
      pkurt_cahaya_alami,
      pkurt_tidak_merokok
    `);

  // Jika bukan admin, filter berdasarkan userId
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  // Filter Tanggal di Server (Supabase) untuk optimasi loading
  if (dateFrom) {
    query = query.gte('date_entry', dateFrom);
  }
  if (dateTo) {
    query = query.lte('date_entry', dateTo);
  }

  // Limit to avoid crash on massive datasets (e.g. 2000 records max for now)
  // If need more, we should implement pagination or aggregation in SQL
  // query = query.limit(2000);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getEntry = async (id: string) => {
  if (isMockMode()) {
    const entries = JSON.parse(localStorage.getItem('mock_entries') || '[]');
    const entry = entries.find((e: any) => e.id === id);
    if (!entry) throw new Error('Entry not found');
    
    // Join family members
    const family = JSON.parse(localStorage.getItem('mock_family') || '[]');
    const members = family.filter((f: any) => f.entry_id === id);
    
    return { ...entry, family_members: members };
  }

  const { data, error } = await supabase.from('entries')
    .select(`
      *,
      rw:rw_id(name),
      rt:rt_id(name),
      family_members (*)
    `)
    .eq('id', id)
    .single();
    
  if (error) throw error;
  return data;
};

export const updateEntry = async (id: string, entryData: any) => {
  if (isMockMode()) {
    const entries = JSON.parse(localStorage.getItem('mock_entries') || '[]');
    const index = entries.findIndex((e: any) => e.id === id);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...entryData };
      localStorage.setItem('mock_entries', JSON.stringify(entries));
      return entries[index];
    }
    return null;
  }

  // Strip out joined data that aren't columns in 'entries' table
  const { 
    family_members: _fm, 
    kelurahan: _k, 
    rw: _rw, 
    rt: _rt, 
    kader: _kd, 
    head_of_family: _hof, // Remove deprecated
    total_souls: _ts,     // Remove deprecated
    latrine_count: _lc,   // Remove deprecated
    ...cleanData 
  } = entryData;

  try {
    let finalRwId = cleanData.rw_id;
    let finalRtId = cleanData.rt_id;
    
    // Resolve RW
    if (cleanData.rw_id && cleanData.kelurahan_id) {
      finalRwId = await resolveLocationId('rw', cleanData.kelurahan_id, cleanData.rw_id);
    }

    // Resolve RT
    if (cleanData.rt_id && finalRwId) {
      finalRtId = await resolveLocationId('rt', finalRwId, cleanData.rt_id);
    }

    const { data, error } = await supabase
      .from('entries')
      .update({...cleanData, rw_id: finalRwId, rt_id: finalRtId})
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Error in updateEntry:', error);
    throw error;
  }
};

export const updateFamilyMembers = async (entryId: string, members: Partial<FamilyMember>[]) => {
  if (isMockMode()) {
    // Replace logic for mock
    let allFamily = JSON.parse(localStorage.getItem('mock_family') || '[]');
    // Remove old
    allFamily = allFamily.filter((f: any) => f.entry_id !== entryId);
    // Add new
    const newMembers = members.map(m => ({ ...m, id: crypto.randomUUID(), entry_id: entryId }));
    allFamily.push(...newMembers);
    localStorage.setItem('mock_family', JSON.stringify(allFamily));
    return;
  }

  // Delete old members (Simple strategy: delete all and recreate)
  const { error: deleteError } = await supabase.from('family_members').delete().eq('entry_id', entryId);
  if (deleteError) throw deleteError;

  // Insert new - Strictly only send columns that exist in the DB schema
  const cleanMembers = members.map((m: any) => ({
    entry_id: entryId,
    kk_number: m.kk_number,
    head_of_family: m.head_of_family,
    total_souls: Number(m.total_souls || 0),
    permanent_souls: Number(m.permanent_souls || 0),
    latrine_count: Number(m.latrine_count || 0)
  }));

  const { error: insertError } = await supabase.from('family_members').insert(cleanMembers);
  if (insertError) {
    if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
       throw new Error(`DATABASE ERROR: Kolom data jiwa/jamban belum ada di tabel family_members. 
       
SOLUSI: Harap jalankan perintah SQL ALTER TABLE di Supabase Editor.`);
    }
    throw insertError;
  }
};

// ============ New Form APIs: Air Measurement, Water Sample, Kuesioner KAMRT ============

export const saveAirMeasurement = async (data: any, userId?: string) => {
  const payload = { ...data, user_id: userId };
  
  if (isMockMode()) {
    const existing = JSON.parse(localStorage.getItem('air_measurements') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('air_measurements', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
  
  try {
    const { data: result, error } = await supabase.from('air_measurements').insert([payload]).select().single();
    if (error) throw error;
    return result;
  } catch (err: any) {
    console.warn('Supabase save failed, fallback to localStorage:', err.message);
    const existing = JSON.parse(localStorage.getItem('air_measurements') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('air_measurements', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
};

export const getAirMeasurements = async () => {
  if (isMockMode()) return JSON.parse(localStorage.getItem('air_measurements') || '[]');
  
  try {
    const { data, error } = await supabase.from('air_measurements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetch failed, using localStorage');
    return JSON.parse(localStorage.getItem('air_measurements') || '[]');
  }
};

export const saveWaterSample = async (data: any, userId?: string) => {
  const payload = { ...data, user_id: userId };
  
  if (isMockMode()) {
    const existing = JSON.parse(localStorage.getItem('water_samples') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('water_samples', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
  
  try {
    const { data: result, error } = await supabase.from('water_samples').insert([payload]).select().single();
    if (error) throw error;
    return result;
  } catch (err: any) {
    console.warn('Supabase save failed, fallback to localStorage:', err.message);
    const existing = JSON.parse(localStorage.getItem('water_samples') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('water_samples', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
};

export const getWaterSamples = async () => {
  if (isMockMode()) return JSON.parse(localStorage.getItem('water_samples') || '[]');
  
  try {
    const { data, error } = await supabase.from('water_samples').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetch failed, using localStorage');
    return JSON.parse(localStorage.getItem('water_samples') || '[]');
  }
};

export const saveKuesionerKAMRT = async (data: any, userId?: string) => {
  const payload = { ...data, user_id: userId };
  
  if (isMockMode()) {
    const existing = JSON.parse(localStorage.getItem('kuesioner_kamrt') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('kuesioner_kamrt', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
  
  try {
    const { data: result, error } = await supabase.from('kuesioner_kamrt').insert([payload]).select().single();
    if (error) throw error;
    return result;
  } catch (err: any) {
    console.warn('Supabase save failed, fallback to localStorage:', err.message);
    const existing = JSON.parse(localStorage.getItem('kuesioner_kamrt') || '[]');
    existing.push({ id: Date.now(), ...payload });
    localStorage.setItem('kuesioner_kamrt', JSON.stringify(existing));
    return { id: Date.now(), ...payload };
  }
};

export const getKuesionerKAMRT = async () => {
  if (isMockMode()) return JSON.parse(localStorage.getItem('kuesioner_kamrt') || '[]');
  
  try {
    const { data, error } = await supabase.from('kuesioner_kamrt').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Supabase fetch failed, using localStorage');
    return JSON.parse(localStorage.getItem('kuesioner_kamrt') || '[]');
  }
};

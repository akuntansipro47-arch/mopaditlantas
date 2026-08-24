export interface Profile {
  id: string;
  name: string;
  address: string;
  phone: string;
  pic_name: string;
  website: string;
  ig: string;
  fb: string;
  twitter: string;
  logo_url: string;
}

export interface Kelurahan {
  id: number;
  name: string;
}

export interface RW {
  id: number;
  kelurahan_id: number;
  name: string;
}

export interface RT {
  id: number;
  rw_id: number;
  name: string;
}

export interface UserProfile {
  id: string;
  nik: string;
  name: string;
  phone: string;
  kelurahan_id?: number;
  rw_id?: number;
  rt_id?: number;
  username: string;
  password_display?: string;
  role: 'admin' | 'kader' | 'super_admin';
  is_active: boolean;
}

export interface Entry {
  id: string;
  user_id: string;
  date_entry: string;
  entry_serial_no: number;
  address: string;
  kelurahan_id: number;
  rw_id: number;
  rt_id: number;
  
  total_souls: number;
  permanent_souls: number;
  latrine_count: number;
  
  // Boolean fields
  jamban_bab_jamban: boolean;
  jamban_milik_sendiri: boolean;
  jamban_septik_aman: boolean;
  jamban_septik_tidak_sedot: boolean;
  jamban_cubluk: boolean;
  jamban_dibuang_drainase: boolean;
  jamban_leher_angsa: boolean;
  
  ctps_sarana: boolean;
  ctps_air_mengalir: boolean;
  ctps_sabun: boolean;
  ctps_mampu_praktek: boolean;
  ctps_tahu_waktu_kritis: boolean;
  ctps_sebelum_makan: boolean;
  ctps_sebelum_olah_makan: boolean;
  ctps_sebelum_susui: boolean;
  ctps_setelah_bab: boolean;
  
  air_layak_perpipaan: boolean;
  air_layak_kran_umum: boolean;
  air_layak_sg_terlindung: boolean;
  air_layak_sgl: boolean;
  air_layak_spl: boolean;
  air_layak_mata_air: boolean;
  air_layak_hujan: boolean;
  
  air_tidak_layak_sungai: boolean;
  air_tidak_layak_danau: boolean;
  air_tidak_layak_waduk: boolean;
  air_tidak_layak_kolam: boolean;
  air_tidak_layak_irigasi: boolean;
  
  olah_air_proses: boolean;
  olah_air_keruh: boolean;
  olah_air_simpan_tutup: boolean;
  
  pangan_tutup: boolean;
  pangan_pisah_b3: boolean;
  pangan_5_kunci: boolean;
  
  sampah_tidak_serak: boolean;
  sampah_tutup_kuat: boolean;
  sampah_olah_aman: boolean;
  sampah_pilah: boolean;
  
  limbah_tidak_genang: boolean;
  limbah_saluran_kedap: boolean;
  limbah_resapan_ipal: boolean;
  
  pkurt_jendela_kamar: boolean;
  pkurt_jendela_keluarga: boolean;
  pkurt_ventilasi: boolean;
  pkurt_lubang_asap: boolean;
  pkurt_cahaya_alami: boolean;
  pkurt_tidak_merokok: boolean;
}

export interface FamilyMember {
  id: string;
  entry_id: string;
  kk_number: string;
  head_of_family: string;
  total_souls: number;
  permanent_souls: number;
  latrine_count: number;
  is_auto_generated?: boolean;
}

export interface Rumah {
  id: string;
  nomor_rumah: string;
  id_rt: string;
  jumlah_jiwa: number;
  jumlah_menetap: number;
  jumlah_jamban: number;
  created_at?: string;
  updated_at?: string;
}

export interface KartuKeluarga {
  id: string;
  nomor_kk: string;
  kepala_keluarga: string;
  id_rumah: string;
  created_at?: string;
  updated_at?: string;
}

export type KuesionerPilarValue = boolean | null;

export interface JawabanKuesioner {
  id: string;
  id_kk: string;
  p1_1: KuesionerPilarValue;
  p1_2: KuesionerPilarValue;
  p1_3: KuesionerPilarValue;
  p1_4: KuesionerPilarValue;
  p1_5: KuesionerPilarValue;
  p1_6: KuesionerPilarValue;
  p1_7: KuesionerPilarValue;
  p2_1: KuesionerPilarValue;
  p2_2: KuesionerPilarValue;
  p2_3: KuesionerPilarValue;
  p2_4: KuesionerPilarValue;
  p2_5: KuesionerPilarValue;
  p2_6: KuesionerPilarValue;
  p2_7: KuesionerPilarValue;
  p2_8: KuesionerPilarValue;
  p3_1: KuesionerPilarValue;
  p3_2: KuesionerPilarValue;
  p3_3: KuesionerPilarValue;
  p3_4: KuesionerPilarValue;
  p3_5: KuesionerPilarValue;
  p3_6: KuesionerPilarValue;
  p3_7: KuesionerPilarValue;
  p3_8: KuesionerPilarValue;
  p3_9: KuesionerPilarValue;
  p3_10: KuesionerPilarValue;
  p3_11: KuesionerPilarValue;
  p3_12: KuesionerPilarValue;
  p3_13: KuesionerPilarValue;
  p3_14: KuesionerPilarValue;
  p4_1: KuesionerPilarValue;
  p4_2: KuesionerPilarValue;
  p4_3: KuesionerPilarValue;
  p4_4: KuesionerPilarValue;
  p5_1: KuesionerPilarValue;
  p5_2: KuesionerPilarValue;
  p5_3: KuesionerPilarValue;
  p5_4: KuesionerPilarValue;
  p5_5: KuesionerPilarValue;
  p5_6: KuesionerPilarValue;
  p5_7: KuesionerPilarValue;
  p5_8: KuesionerPilarValue;
  p5_9: KuesionerPilarValue;
  created_at?: string;
  updated_at?: string;
}

export interface KKWithJawaban extends KartuKeluarga {
  jawaban_kuesioner?: JawabanKuesioner | null;
}

export interface RumahDetail extends Rumah {
  rt?: RT | null;
  rw?: RW | null;
  kelurahan?: Kelurahan | null;
  kk_list?: KKWithJawaban[];
}

export interface HouseholdSavePayload {
  rumah: Omit<Rumah, 'id' | 'created_at' | 'updated_at'> & {
    nomor_rumah: string;
    id_rt: string;
  };
  kk_list: Array<{
    nomor_kk: string;
    kepala_keluarga: string;
    jawaban_kuesioner: Record<string, boolean | null>;
  }>;
}

export interface HouseholdSaveResult {
  rumah: Rumah;
  kk: KartuKeluarga[];
  jawaban_kuesioner: JawabanKuesioner[];
}

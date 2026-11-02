//! Notas de voz: de WebM/Opus (lo que graba el navegador) a OGG/Opus (lo único
//! que Telegram, y luego WhatsApp, aceptan como nota de voz).
//!
//! No se recodifica nada: el audio Opus es el mismo, solo cambia el
//! contenedor. Se leen los bloques del WebM y se escriben como paquetes Ogg
//! (RFC 7845). El WebM de `MediaRecorder` es "en directo": Segment y Cluster
//! llevan tamaño desconocido, así que aquí no se recorre como un árbol sino como
//! una secuencia plana de elementos, entrando en los contenedores que importan.

use std::io::Cursor;

use ogg::writing::{PacketWriteEndInfo, PacketWriter};

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum RemuxError {
    #[error("WebM mal formado")]
    Malformed,
    #[error("El WebM no trae audio Opus")]
    NoOpus,
    #[error("El WebM usa lacing, no soportado")]
    Lacing,
}

// Elementos EBML/Matroska que se usan.
const SEGMENT: u32 = 0x1853_8067;
const CLUSTER: u32 = 0x1F43_B675;
const TRACKS: u32 = 0x1654_AE6B;
const TRACK_ENTRY: u32 = 0xAE;
const BLOCK_GROUP: u32 = 0xA0;
const TRACK_NUMBER: u32 = 0xD7;
const CODEC_ID: u32 = 0x86;
const CODEC_PRIVATE: u32 = 0x63A2;
const SIMPLE_BLOCK: u32 = 0xA3;
const BLOCK: u32 = 0xA1;

/// Contenedores en los que se entra (el resto se salta entero).
const DESCEND: [u32; 5] = [SEGMENT, CLUSTER, TRACKS, TRACK_ENTRY, BLOCK_GROUP];

/// Número de serie del flujo Ogg (cualquiera vale con un solo flujo).
const SERIAL: u32 = 0x4B45_4952;

pub fn webm_opus_to_ogg(webm: &[u8]) -> Result<Vec<u8>, RemuxError> {
    let mut pos = 0usize;
    // Pista en curso mientras se leen sus campos, y la pista Opus elegida.
    let mut track_number: Option<u64> = None;
    let mut track_is_opus = false;
    let mut opus_track: Option<u64> = None;
    let mut opus_head: Option<Vec<u8>> = None;
    let mut packets: Vec<Vec<u8>> = Vec::new();

    while pos < webm.len() {
        let (id, id_len) = read_id(&webm[pos..]).ok_or(RemuxError::Malformed)?;
        let (size, size_len) = read_size(&webm[pos + id_len..]).ok_or(RemuxError::Malformed)?;
        let body = pos + id_len + size_len;

        if DESCEND.contains(&id) {
            if id == TRACK_ENTRY {
                track_number = None;
                track_is_opus = false;
            }
            pos = body; // se entra: lo siguiente son sus hijos
            continue;
        }
        let size = size.ok_or(RemuxError::Malformed)? as usize;
        let end = body.checked_add(size).ok_or(RemuxError::Malformed)?;
        let data = webm.get(body..end).ok_or(RemuxError::Malformed)?;

        match id {
            TRACK_NUMBER => {
                track_number = Some(read_uint(data));
                if track_is_opus && opus_track.is_none() {
                    opus_track = track_number;
                }
            }
            CODEC_ID => {
                track_is_opus = data == b"A_OPUS";
                if track_is_opus && opus_track.is_none() {
                    opus_track = track_number;
                }
            }
            CODEC_PRIVATE if track_is_opus => opus_head = Some(data.to_vec()),
            SIMPLE_BLOCK | BLOCK => {
                let (track, n) = read_size(data).ok_or(RemuxError::Malformed)?;
                // Detrás del número de pista: 2 bytes de tiempo y 1 de flags.
                let flags = *data.get(n + 2).ok_or(RemuxError::Malformed)?;
                if (flags >> 1) & 0x03 != 0 {
                    return Err(RemuxError::Lacing);
                }
                if track.is_some() && track == opus_track {
                    packets.push(data[n + 3..].to_vec());
                }
            }
            _ => {}
        }
        pos = end;
    }

    if opus_track.is_none() || packets.is_empty() {
        return Err(RemuxError::NoOpus);
    }
    let head = opus_head.unwrap_or_else(default_opus_head);
    write_ogg(&head, &packets)
}

fn write_ogg(head: &[u8], packets: &[Vec<u8>]) -> Result<Vec<u8>, RemuxError> {
    let mut writer = PacketWriter::new(Cursor::new(Vec::new()));
    let io = |_| RemuxError::Malformed;
    // Cabeceras, cada una en su página (RFC 7845 §3).
    writer
        .write_packet(head.to_vec(), SERIAL, PacketWriteEndInfo::EndPage, 0)
        .map_err(io)?;
    writer
        .write_packet(opus_tags(), SERIAL, PacketWriteEndInfo::EndPage, 0)
        .map_err(io)?;

    // La posición de cada página son las muestras a 48 kHz acumuladas.
    let mut granule = 0u64;
    for (i, packet) in packets.iter().enumerate() {
        granule += u64::from(opus_samples(packet).unwrap_or(960));
        let end = if i + 1 == packets.len() {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::NormalPacket
        };
        writer
            .write_packet(packet.clone(), SERIAL, end, granule)
            .map_err(io)?;
    }
    Ok(writer.into_inner().into_inner())
}

/// Muestras (a 48 kHz) de un paquete Opus, según su byte TOC (RFC 6716 §3.1).
fn opus_samples(packet: &[u8]) -> Option<u32> {
    let toc = *packet.first()?;
    let config = toc >> 3;
    let per_frame = match config {
        0..=11 => [480, 960, 1920, 2880][usize::from(config % 4)], // SILK: 10–60 ms
        12..=15 => [480, 960][usize::from(config % 2)],            // híbrido: 10–20 ms
        _ => [120, 240, 480, 960][usize::from(config % 4)],        // CELT: 2,5–20 ms
    };
    let frames = match toc & 0x03 {
        0 => 1,
        1 | 2 => 2,
        _ => u32::from(*packet.get(1)? & 0x3F),
    };
    Some(per_frame * frames)
}

/// OpusHead por defecto si el WebM no la trae: mono, 48 kHz.
fn default_opus_head() -> Vec<u8> {
    let mut h = b"OpusHead".to_vec();
    h.push(1); // versión
    h.push(1); // canales
    h.extend(312u16.to_le_bytes()); // pre-skip
    h.extend(48_000u32.to_le_bytes());
    h.extend(0i16.to_le_bytes()); // ganancia
    h.push(0); // mapeo de canales
    h
}

fn opus_tags() -> Vec<u8> {
    let vendor = b"Keirost";
    let mut t = b"OpusTags".to_vec();
    t.extend((vendor.len() as u32).to_le_bytes());
    t.extend(vendor);
    t.extend(0u32.to_le_bytes()); // sin comentarios
    t
}

/// Id de elemento EBML: 1–4 bytes, con el bit marcador incluido.
fn read_id(b: &[u8]) -> Option<(u32, usize)> {
    let first = *b.first()?;
    let len = first.leading_zeros() as usize + 1;
    if len > 4 || b.len() < len {
        return None;
    }
    Some((
        b[..len]
            .iter()
            .fold(0u32, |acc, x| (acc << 8) | u32::from(*x)),
        len,
    ))
}

/// Tamaño EBML (1–8 bytes, sin el marcador). `None` en el valor = desconocido.
fn read_size(b: &[u8]) -> Option<(Option<u64>, usize)> {
    let first = *b.first()?;
    let len = first.leading_zeros() as usize + 1;
    if len > 8 || b.len() < len {
        return None;
    }
    let mask = if len == 8 { 0 } else { 0xFFu8 >> len };
    let mut value = u64::from(first & mask);
    let mut all_ones = (first & mask) == mask;
    for x in &b[1..len] {
        value = (value << 8) | u64::from(*x);
        all_ones &= *x == 0xFF;
    }
    Some((if all_ones { None } else { Some(value) }, len))
}

fn read_uint(b: &[u8]) -> u64 {
    b.iter().fold(0u64, |acc, x| (acc << 8) | u64::from(*x))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ogg::reading::PacketReader;

    fn el(id: &[u8], body: &[u8]) -> Vec<u8> {
        let mut out = id.to_vec();
        // Tamaño en 8 bytes (0x01 + 7 bytes), válido para cualquier longitud.
        out.push(0x01);
        out.extend(&(body.len() as u64).to_be_bytes()[1..]);
        out.extend(body);
        out
    }

    /// Un WebM como el de MediaRecorder: Segment y Cluster de tamaño desconocido.
    fn sample_webm(packets: &[&[u8]]) -> Vec<u8> {
        let unknown = [0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
        let mut track = el(&[0xD7], &[1]);
        track.extend(el(&[0x86], b"A_OPUS"));
        track.extend(el(&[0x63, 0xA2], &default_opus_head()));
        let tracks = el(&[0x16, 0x54, 0xAE, 0x6B], &el(&[0xAE], &track));

        let mut webm = el(&[0x1A, 0x45, 0xDF, 0xA3], &el(&[0x42, 0x82], b"webm"));
        webm.extend([0x18, 0x53, 0x80, 0x67]);
        webm.extend(unknown);
        webm.extend(tracks);
        webm.extend([0x1F, 0x43, 0xB6, 0x75]);
        webm.extend(unknown);
        webm.extend(el(&[0xE7], &[0])); // Timecode del cluster
        for p in packets {
            let mut block = vec![0x81, 0x00, 0x00, 0x80]; // pista 1, tiempo 0, keyframe
            block.extend(*p);
            webm.extend(el(&[0xA3], &block));
        }
        webm
    }

    #[test]
    fn convierte_y_cuenta_las_muestras() {
        // TOC 0xF8: CELT 20 ms, un frame → 960 muestras por paquete.
        let packets: [&[u8]; 3] = [&[0xF8, 1, 2], &[0xF8, 3], &[0xF8, 4, 5, 6]];
        let ogg = webm_opus_to_ogg(&sample_webm(&packets)).unwrap();

        let mut reader = PacketReader::new(Cursor::new(ogg));
        let head = reader.read_packet().unwrap().unwrap();
        assert!(head.data.starts_with(b"OpusHead"));
        let tags = reader.read_packet().unwrap().unwrap();
        assert!(tags.data.starts_with(b"OpusTags"));
        let mut audio = Vec::new();
        while let Some(p) = reader.read_packet().unwrap() {
            audio.push(p);
        }
        assert_eq!(audio.len(), 3);
        assert_eq!(audio[2].data, vec![0xF8, 4, 5, 6]);
        assert_eq!(audio.last().unwrap().absgp_page(), 2880);
    }

    #[test]
    fn sin_opus_no_convierte() {
        assert_eq!(
            webm_opus_to_ogg(b"no es un webm"),
            Err(RemuxError::Malformed)
        );
    }

    #[test]
    fn duracion_de_paquetes_opus() {
        assert_eq!(opus_samples(&[0xF8]), Some(960)); // CELT 20 ms
        assert_eq!(opus_samples(&[0x08]), Some(960)); // SILK 20 ms
        assert_eq!(opus_samples(&[0xFB, 0x03]), Some(2880)); // 3 frames de 20 ms
    }

    /// Con un WebM real: `VOICE_WEBM=ruta cargo test -- --ignored webm_real`.
    #[test]
    #[ignore]
    fn webm_real() {
        let path = std::env::var("VOICE_WEBM").expect("VOICE_WEBM");
        let webm = std::fs::read(&path).unwrap();
        let ogg = webm_opus_to_ogg(&webm).unwrap();
        std::fs::write(format!("{path}.ogg"), &ogg).unwrap();
        let mut reader = PacketReader::new(Cursor::new(ogg));
        let mut count = 0;
        let mut last = 0;
        while let Some(p) = reader.read_packet().unwrap() {
            count += 1;
            last = p.absgp_page();
        }
        println!(
            "paquetes: {count}, duración: {:.1} s",
            last as f64 / 48_000.0
        );
    }
}

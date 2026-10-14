"""Ejecuta las instrucciones originales del lector ST, sin abrir puertos ni hardware.

Dependencias de análisis: pefile y unicorn. Las llamadas CRT fscanf/fclose y la
comprobación de pila se sustituyen; el bloque de Embro se ejecuta sin traducirlo.
Esto verifica los registros cargados, no la pantalla ni el cálculo de puntadas.
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path.home() / 'AppData/Local/Temp/plugit-embro-analysis'))
import pefile
from unicorn import Uc, UC_ARCH_X86, UC_MODE_32, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EBP, UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_EAX

ROOT = Path(__file__).resolve().parents[1]
EXE = Path(r'C:\Program Files\optec\embro\embro.exe')
pe = pefile.PE(str(EXE))
image = pe.get_memory_mapped_image()


def inspect(path):
    # Cada archivo obtiene memoria nueva para evitar contaminación entre pruebas.
    uc = Uc(UC_ARCH_X86, UC_MODE_32)
    uc.mem_map(0x400000, (len(image) + 4095) // 4096 * 4096)
    uc.mem_write(0x400000, image)
    uc.mem_map(0x10000000, 0x200000)
    uc.mem_map(0x20000000, 0x2000)
    ebp, esp = 0x10100000, 0x10080000
    uc.reg_write(UC_X86_REG_EBP, ebp)
    uc.reg_write(UC_X86_REG_ESP, esp)

    def put(address, value):
        uc.mem_write(address, struct.pack('<I', value & 0xffffffff))

    def get(address):
        return struct.unpack('<I', uc.mem_read(address, 4))[0]

    put(ebp - 0x14, 0x20000000)  # Objeto con contador de registros a cero.
    put(ebp - 0x2768, 1)        # FILE ficticio; no se ejecuta ninguna llamada al SO.
    tokens = path.read_text().split()
    cursor = 0

    def hook(machine, address, size, _):
        nonlocal cursor
        stack = machine.reg_read(UC_X86_REG_ESP)
        if address in (0x44f0a4, 0x44f0d7):
            # Simula las conversiones del formato CRT, respetando destinos reales.
            fmt = get(stack + 4)
            raw = bytearray()
            while True:
                byte = bytes(machine.mem_read(fmt + len(raw), 1))
                if byte == b'\0':
                    break
                raw.extend(byte)
            fields = raw.decode().split()
            converted = 0
            for index, field in enumerate(fields):
                if cursor >= len(tokens):
                    break
                value = tokens[cursor]
                destination = get(stack + 8 + index * 4)
                packed = struct.pack('<i', int(value)) if field == '%d' else struct.pack('<f', float(value))
                machine.mem_write(destination, packed)
                cursor += 1
                converted += 1
            machine.reg_write(UC_X86_REG_EAX, converted if converted else 0xffffffff)
            machine.reg_write(UC_X86_REG_EIP, address + size)
        elif address == 0x426207:
            # Retorno de la comprobación de pila de la compilación Debug.
            machine.reg_write(UC_X86_REG_EIP, get(stack))
            machine.reg_write(UC_X86_REG_ESP, stack + 4)
        elif address == 0x44f2ba:
            machine.reg_write(UC_X86_REG_EIP, address + size)  # fclose sustituido.

    uc.hook_add(UC_HOOK_CODE, hook)
    # Se detiene justo después de cargar todos los registros, antes de geometría.
    uc.emu_start(0x44f018, 0x44f2ca, count=100000)
    if uc.reg_read(UC_X86_REG_EIP) != 0x44f2ca:
        raise RuntimeError(f'El lector no terminó: {path.name}')
    count = get(0x20000054)
    records = []
    for index in range(count):
        flag, attribute, x, y = struct.unpack('<HHff', uc.mem_read(0x622e88 + index * 12, 12))
        records.append(dict(type=flag & 7, attribute=attribute, x=x, y=y))
    return dict(file=path.name, tokensConsumed=cursor, records=records)


results = [inspect(p) for p in sorted((ROOT / 'exports/embro-experiments').glob('*.ST'))]
base = next(r['records'] for r in results if r['file'] == '00_BASE.ST')
for result in results:
    result['sameLoadedRecordsAsBase'] = result['records'] == base
output = ROOT / 'exports/embro-experiments/reader-results.json'
output.write_text(json.dumps(results, indent=2), encoding='utf-8')
for result in results:
    print(result['file'], 'IGUAL' if result['sameLoadedRecordsAsBase'] else 'DIFERENTE', len(result['records']))

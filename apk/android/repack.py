import sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
keep_stored = {'resources.arsc'} | {n for n in
    ['mipmap-mdpi/ic_launcher.png', 'mipmap-hdpi/ic_launcher.png',
     'mipmap-xhdpi/ic_launcher.png', 'mipmap-xxhdpi/ic_launcher.png',
     'mipmap-xxxhdpi/ic_launcher.png']}

with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w') as zout:
    for info in zin.infolist():
        data = zin.read(info.filename)
        zi = zipfile.ZipInfo(info.filename)
        zi.compress_type = zipfile.ZIP_STORED if info.filename in keep_stored else zipfile.ZIP_DEFLATED
        zi.external_attr = info.external_attr & 0xff000000 | (info.external_attr & 0xffff)
        zi.flag_bits = 0
        zi.create_system = 3
        zout.writestr(zi, data)
print('repack ok:', dst)
import AppKit

// Renders an SF Symbol to a transparent PNG at 3x, so the mockup can use the
// real system glyph without hunting for its private-use codepoint.
let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: render-symbol <symbol-name> <point-size> <out.png>\n".data(using: .utf8)!)
    exit(2)
}

let symbolName = args[1]
let pointSize = CGFloat(Double(args[2]) ?? 14)
let outPath = args[3]
let scale: CGFloat = 3

guard let symbol = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil) else {
    FileHandle.standardError.write("no such symbol: \(symbolName)\n".data(using: .utf8)!)
    exit(1)
}

let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .regular, scale: .medium)
guard let configured = symbol.withSymbolConfiguration(config) else {
    FileHandle.standardError.write("could not configure symbol\n".data(using: .utf8)!)
    exit(1)
}

let size = configured.size
let pixelW = Int((size.width * scale).rounded())
let pixelH = Int((size.height * scale).rounded())

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixelW,
    pixelsHigh: pixelH,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else { exit(1) }
rep.size = size

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.black.set()
let rect = NSRect(origin: .zero, size: size)
configured.draw(in: rect)
rect.fill(using: .sourceAtop)
NSGraphicsContext.restoreGraphicsState()

guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
try data.write(to: URL(fileURLWithPath: outPath))
print("\(symbolName) -> \(outPath)  \(size.width)x\(size.height)pt  \(pixelW)x\(pixelH)px")

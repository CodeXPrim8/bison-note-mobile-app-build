/** Decorative floating 3D digital vouchers + gifts for the marketing hero. */

export function FloatingVouchers() {
  return (
    <div className="bu-float-stage" aria-hidden>
      <div className="bu-float-glow bu-float-glow-a" />
      <div className="bu-float-glow bu-float-glow-b" />
      <div className="bu-float-glow bu-float-glow-mist" />

      {/* Soft lavender glass disks — mist reference language */}
      <div className="bu-mist-disk bu-mist-disk-lg" />
      <div className="bu-mist-disk bu-mist-disk-md" />
      <div className="bu-mist-disk bu-mist-disk-sm" />

      <div className="bu-float-item bu-float-v1">
        <div className="bu-float-voucher">
          <span className="bu-float-voucher-mark">Ƀ</span>
          <span className="bu-float-voucher-meta">DIGITAL VOUCHER</span>
          <span className="bu-float-voucher-amt">500 ɃUCKS</span>
        </div>
      </div>

      <div className="bu-float-item bu-float-v2">
        <div className="bu-float-voucher bu-float-voucher-cyan">
          <span className="bu-float-voucher-mark">Ƀ</span>
          <span className="bu-float-voucher-meta">GIFT</span>
          <span className="bu-float-voucher-amt">Ƀ50,000</span>
        </div>
      </div>

      <div className="bu-float-item bu-float-gift1">
        <div className="bu-float-gift">
          <span className="bu-float-gift-lid" />
          <span className="bu-float-gift-bow" />
          <span className="bu-float-gift-body" />
        </div>
      </div>

      <div className="bu-float-item bu-float-gift2">
        <div className="bu-float-gift bu-float-gift-magenta">
          <span className="bu-float-gift-lid" />
          <span className="bu-float-gift-bow" />
          <span className="bu-float-gift-body" />
        </div>
      </div>

      <div className="bu-float-item bu-float-ticket">
        <div className="bu-float-pass">
          <span className="bu-float-pass-label">TICKET</span>
          <span className="bu-float-pass-qr" />
        </div>
      </div>
    </div>
  )
}

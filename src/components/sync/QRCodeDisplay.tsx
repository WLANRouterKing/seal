import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'

interface QRCodeDisplayProps {
  qrData: string
  onCodeEntered: (code: string, answer: string) => void
  onCancel: () => void
}

export function QRCodeDisplay({ qrData, onCodeEntered, onCancel }: QRCodeDisplayProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [answerInput, setAnswerInput] = useState('')
  const [step, setStep] = useState<'qr' | 'code'>('qr')

  const handleCodeChange = (value: string) => {
    // Format as XXX-XXX
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleaned.length <= 6) {
      if (cleaned.length > 3) {
        setCode(cleaned.slice(0, 3) + '-' + cleaned.slice(3))
      } else {
        setCode(cleaned)
      }
    }
  }

  const handleSubmit = () => {
    if (code.replace('-', '').length === 6 && answerInput) {
      onCodeEntered(code, answerInput)
    }
  }

  const handleAnswerPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text')
    // Check if this looks like an answer (base64 string)
    if (pasted && pasted.length > 50) {
      setAnswerInput(pasted.trim())
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {step === 'qr' && (
        <>
          <p className="text-theme-text-secondary text-center">
            {t('sync.showingQR')}
          </p>

          <div className="bg-white p-4 rounded-xl">
            <QRCodeSVG
              value={qrData}
              size={250}
              level="M"
              includeMargin={false}
            />
          </div>

          <button
            onClick={() => setStep('code')}
            className="btn-primary py-3 px-6"
          >
            {t('sync.enterCode')}
          </button>

          <button onClick={onCancel} className="btn-secondary">
            {t('sync.cancel')}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="text-theme-text-secondary text-center">
            {t('sync.enterCodeFromDevice') || 'Enter the code shown on the other device'}
          </p>

          <input
            type="text"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="XXX-XXX"
            className="text-3xl font-mono text-center tracking-widest input-field py-4 w-48"
            maxLength={7}
            autoFocus
          />

          <div className="w-full">
            <label className="block text-sm text-theme-text-secondary mb-2">
              {t('sync.pasteAnswer') || 'Paste connection data from other device (optional for advanced setup)'}
            </label>
            <textarea
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              onPaste={handleAnswerPaste}
              placeholder={t('sync.answerPlaceholder') || 'Paste answer data here...'}
              className="input-field w-full h-24 font-mono text-sm resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('qr')}
              className="btn-secondary"
            >
              {t('sync.back') || 'Back'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={code.replace('-', '').length !== 6}
              className="btn-primary py-3 px-6 disabled:opacity-50"
            >
              {t('sync.connect') || 'Connect'}
            </button>
          </div>

          <button onClick={onCancel} className="text-theme-text-secondary text-sm">
            {t('sync.cancel')}
          </button>
        </>
      )}
    </div>
  )
}

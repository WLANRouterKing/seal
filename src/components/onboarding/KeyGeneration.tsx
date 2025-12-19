import { useTranslation } from 'react-i18next'

export default function KeyGeneration({ isLoading }: { isLoading: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mb-6" />
      <h2 className="text-xl font-semibold text-theme-text mb-2">
        {isLoading ? t('onboarding.generating') : t('onboarding.generated')}
      </h2>
      <p className="text-theme-muted text-center">
        {t('onboarding.generatingDesc')}
      </p>
    </div>
  )
}

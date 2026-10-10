<?php
/**
 * Copyright (c) 2026 Rodrigo Cardoso. MIT License.
 */
declare(strict_types=1);

namespace MagePanda\CardScanner\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

class Config
{
    private const PATH = 'magepanda_cardscanner/general/';

    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @param ScopeConfigInterface $scopeConfig
     */
    public function __construct(ScopeConfigInterface $scopeConfig)
    {
        $this->scopeConfig = $scopeConfig;
    }

    public function isEnabled(?int $storeId = null): bool
    {
        return $this->flag('enabled', $storeId);
    }

    public function showOnDesktop(?int $storeId = null): bool
    {
        return $this->flag('show_on_desktop', $storeId);
    }

    public function useNativeAutocomplete(?int $storeId = null): bool
    {
        return $this->flag('native_autocomplete', $storeId);
    }

    /**
     * Códigos de método liberados; lista vazia = todos.
     *
     * @return string[]
     */
    public function getAllowedMethods(?int $storeId = null): array
    {
        $value = (string)$this->scopeConfig->getValue(self::PATH . 'allowed_methods', ScopeInterface::SCOPE_STORE, $storeId);

        return array_values(array_filter(array_map('trim', explode(',', $value)), function ($v) {
            return $v !== '';
        }));
    }

    public function getButtonLabel(?int $storeId = null): string
    {
        return trim((string)$this->scopeConfig->getValue(self::PATH . 'button_label', ScopeInterface::SCOPE_STORE, $storeId));
    }

    private function flag(string $field, ?int $storeId): bool
    {
        return $this->scopeConfig->isSetFlag(self::PATH . $field, ScopeInterface::SCOPE_STORE, $storeId);
    }
}

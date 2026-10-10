<?php
/**
 * Copyright (c) 2026 Rodrigo Cardoso. MIT License.
 */
declare(strict_types=1);

namespace MagePanda\CardScanner\Model;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Store\Model\StoreManagerInterface;

/**
 * Expõe a configuração em window.checkoutConfig.magepandaCardScanner.
 */
class CheckoutConfigProvider implements ConfigProviderInterface
{
    /**
     * @var Config
     */
    private $config;

    /**
     * @var StoreManagerInterface
     */
    private $storeManager;

    /**
     * @param Config $config
     * @param StoreManagerInterface $storeManager
     */
    public function __construct(Config $config, StoreManagerInterface $storeManager)
    {
        $this->config = $config;
        $this->storeManager = $storeManager;
    }

    public function getConfig(): array
    {
        $storeId = (int)$this->storeManager->getStore()->getId();

        if (!$this->config->isEnabled($storeId)) {
            return ['magepandaCardScanner' => ['enabled' => false]];
        }

        return [
            'magepandaCardScanner' => [
                'enabled' => true,
                'showOnDesktop' => $this->config->showOnDesktop($storeId),
                'nativeAutocomplete' => $this->config->useNativeAutocomplete($storeId),
                'methods' => $this->config->getAllowedMethods($storeId),
                'buttonLabel' => $this->config->getButtonLabel($storeId) ?: (string)__('Scan card'),
            ],
        ];
    }
}

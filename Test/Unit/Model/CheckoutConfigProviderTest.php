<?php
/**
 * Copyright (c) 2026 Rodrigo Cardoso. MIT License.
 */
declare(strict_types=1);

namespace MagePanda\CardScanner\Test\Unit\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use MagePanda\CardScanner\Model\CheckoutConfigProvider;
use MagePanda\CardScanner\Model\Config;
use PHPUnit\Framework\TestCase;

class CheckoutConfigProviderTest extends TestCase
{
    /** @var array<string, string|null> */
    private array $values = [];

    private function provider(): CheckoutConfigProvider
    {
        $scope = $this->createMock(ScopeConfigInterface::class);
        $scope->method('getValue')->willReturnCallback(fn (string $path) => $this->values[$path] ?? null);
        $scope->method('isSetFlag')->willReturnCallback(fn (string $path) => (bool)($this->values[$path] ?? false));

        $store = $this->createMock(StoreInterface::class);
        $store->method('getId')->willReturn(1);
        $storeManager = $this->createMock(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new CheckoutConfigProvider(new Config($scope), $storeManager);
    }

    public function testDisabledExposesOnlyFlag(): void
    {
        $this->values = ['magepanda_cardscanner/general/enabled' => '0'];

        $this->assertSame(['magepandaCardScanner' => ['enabled' => false]], $this->provider()->getConfig());
    }

    public function testEnabledParsesMethodListAndLabel(): void
    {
        $this->values = [
            'magepanda_cardscanner/general/enabled' => '1',
            'magepanda_cardscanner/general/show_on_desktop' => '0',
            'magepanda_cardscanner/general/native_autocomplete' => '1',
            'magepanda_cardscanner/general/allowed_methods' => 'braintree, mp_testcc ,,pagarme_creditcard',
            'magepanda_cardscanner/general/button_label' => '  Ler cartão  ',
        ];

        $config = $this->provider()->getConfig()['magepandaCardScanner'];

        $this->assertTrue($config['enabled']);
        $this->assertFalse($config['showOnDesktop']);
        $this->assertTrue($config['nativeAutocomplete']);
        $this->assertSame(['braintree', 'mp_testcc', 'pagarme_creditcard'], $config['methods']);
        $this->assertSame('Ler cartão', $config['buttonLabel']);
    }

    public function testEmptyMethodListMeansAll(): void
    {
        $this->values = ['magepanda_cardscanner/general/enabled' => '1', 'magepanda_cardscanner/general/allowed_methods' => ''];

        $this->assertSame([], $this->provider()->getConfig()['magepandaCardScanner']['methods']);
    }
}

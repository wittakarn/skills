using Shop.Orders;
using Xunit;

namespace Shop.Orders.Tests;

public class PricingTests
{
    [Fact]
    [Trait("BR", "BR-ORD-001")]
    public void Discount_IsCappedAt20Percent()
    {
        Assert.Equal(200m, Pricing.Discount(1000m, 30m));
        Assert.Equal(200m, Pricing.Discount(1000m, 20m));
    }

    // BR-ORD-002: tax is charged after the discount
    [Theory]
    [InlineData(1000, 100, 63.00)]
    [InlineData(500, 0, 35.00)]
    public void Tax_IsAppliedAfterDiscount(decimal subtotal, decimal discount, decimal expected)
    {
        Assert.Equal(expected, Pricing.Tax(subtotal, discount));
    }

    [Fact]
    public void BR_ORD_003_FreeShipping_AtThreshold()
    {
        Assert.Equal(50m, Pricing.Shipping(1050m, 100m));
        Assert.Equal(0m, Pricing.Shipping(1100m, 100m));
    }

    [Fact]
    public void Describe_FormatsTotal()
    {
        // braces inside strings must not confuse the parser: "{" and '}'
        var expected = @"Total: ""1,234.50""".Replace("\"", "");
        Assert.Equal(expected, Pricing.Describe(1234.5m));
    }

    [Fact]
    [Trait("BR", "BR-ORD-004")]
    public void GiftWrap_Is35PerItem()
    {
        Assert.Equal(70m, Pricing.GiftWrap(2));
    }

    [Fact]
    [Trait("BR", "BR-ORD-006")]
    public void Loyalty_DoublesOver5000()
    {
        Assert.Equal(2, Pricing.LoyaltyMultiplier(6000m));
    }

    [Fact]
    [Trait("BR", "BR-ORD-009")]
    public void Shipping_IsNeverNegative()
    {
        Assert.True(Pricing.Shipping(0m, 0m) >= 0m);
    }
}

namespace Shop.Orders;

public static class Pricing
{
    public const decimal VatRate = 0.07m;
    public const decimal ShippingFee = 50m;

    // Coupon percent is capped at 20.
    public static decimal Discount(decimal subtotal, decimal couponPercent)
    {
        var pct = Math.Min(couponPercent, 20m);
        return Math.Round(subtotal * pct / 100m, 2);
    }

    public static decimal Tax(decimal subtotal, decimal discount)
    {
        return Math.Round((subtotal - discount) * VatRate, 2);
    }

    public static decimal Shipping(decimal subtotal, decimal discount)
    {
        return subtotal - discount >= 1000m ? 0m : ShippingFee;
    }
    public static decimal GiftWrap(int items) => items * 35m;

    public static int LoyaltyMultiplier(decimal total) =>
        total > 5000m ? 2 : 1;

    public static string Describe(decimal total) => $"Total: {total:N2}";
}

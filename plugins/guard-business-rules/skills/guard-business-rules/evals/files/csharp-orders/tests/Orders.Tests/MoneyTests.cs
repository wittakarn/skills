using Xunit;

namespace Shop.Orders.Tests;

public class MoneyTests
{
    [Fact]
    public void Round_UsesBankersRounding()
    {
        Assert.Equal(2m, Math.Round(2.5m));
    }
}

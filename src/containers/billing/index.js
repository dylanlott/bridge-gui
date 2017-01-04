import React, { Component, PropTypes } from 'react';
import { connect } from 'react-apollo';
import gql from 'graphql-tag';
import moment from 'moment';
import BalancePanel from 'components/billing/balance-panel';
import PaymentInfoPanel from 'components/billing/payment-info-panel';
import UsagePanel from 'components/billing/usage-panel';
import AddCardForm from 'containers/billing/add-card-form';
import TransactionsList from 'components/billing/transactions-list';
import { setBalance, setUsage } from 'redux/modules/transaction-group';
import 'containers/billing/billing.scss';

const transactionRangeQuery =
  gql`query usageTransactions($startDate: String!, $endDate: String!) {
      credits(startDate: $startDate, endDate: $endDate) {
        id,
        paid_amount,
        created,
        type
      }
      debits(startDate: $startDate, endDate: $endDate) {
        id,
        amount,
        created,
        type
      },
    }`;

const mapQueriesToProps = () => {
  return {
    paymentProcessor: {
      query: gql`query {
        paymentProcessor {
          id,
          name,
          billingDate,
          defaultPaymentMethod {
            merchant,
            lastFour,
            id
          },
          error
        }
      }`
    },
    transactions: {
      query: gql`query {
        credits {
          id,
          paid_amount,
          created,
          type
        },
        debits {
          id,
          amount,
          created,
          type
        }
      }`
    }
  };
};

const mapMutationsToProps = () => {
  return {
    removeCard: () => {
      return {
        // TODO: maybe add `id,` to get query update?
        mutation: gql`
        mutation {
          removePaymentProcessor {
            id,
            name,
            billingDate,
            defaultPaymentMethod {
              merchant,
              lastFour,
              id
            },
            error
          }
        }`
      };
    }
  };
};

const mapDispatchToProps = {
  setBalance,
  setUsage
};

const mapStateToProps = ({ transactionGroup: { balance, usage } }) => {
  return { balance, usage };
};

let globalCounter = 0;

@connect({
  mapQueriesToProps,
  mapMutationsToProps,
  mapDispatchToProps,
  mapStateToProps
})

export default class Billing extends Component {
  static propTypes = {
    query: PropTypes.func,
    setBalance: PropTypes.func,
    setUsage: PropTypes.func,
    paymentProcessor: PropTypes.object,
    transactions: PropTypes.object,
    mutations: PropTypes.func,
    balance: PropTypes.number,
    usage: PropTypes.number
  }

  componentWillReceiveProps(nextProps) {
    globalCounter++;
    if(globalCounter > 50) return;
    console.log(globalCounter);
    console.log('balance and usage: ', balance, usage);

    const {balance, usage} = nextProps;

    if (!!balance && !!usage) {
      return console.log('stopping');
    }

    const {startDate: balanceStartDate, endDate: balanceEndDate} = this.getBalanceRange();
    const {startDate: usageStartDate, endDate: usageEndDate} = this.getUsageRange();

    const balancePromise = this.props.query({
      query: transactionRangeQuery,
      variables: {
        startDate: balanceStartDate,
        endDate: balanceEndDate
      }
    });

    const usagePromise = this.props.query({
      query: transactionRangeQuery,
      variables: {
        startDate: usageStartDate,
        endDate: usageEndDate
      }
    });

    balancePromise.then(({ data: { credits, debits }}) => {
      const balance = this.calculateBalance(credits, debits);
      this.props.setBalance(balance);
    });

    usagePromise.then(({ data: { credits, debits }}) => {
      const usage = this.calculateBalance(credits, debits);
      this.props.setUsage(usage);
    });
  }

  getBalanceRange() {
    const {loading, paymentProcessor} = this.props.paymentProcessor;
    const billingDate = (loading || !paymentProcessor) ? (new Date).getDate() : paymentProcessor.billingDate;
    const today = new Date();
    const daysInMonth = (new Date(today.getFullYear(), (today.getMonth() - 1), 0)).getDate();
    const startDayOfMonth = (billingDate > daysInMonth) ? daysInMonth : billingDate;
    const startDate = Date.parse(new Date(
      today.getFullYear(),
      (today.getMonth() - 1),
      startDayOfMonth
    ));
    const endDate = (moment(startDate).add('1', 'month').valueOf());

    return {
      startDate: dates.startDate,
      endDate: dates.endDate
    };
  }

  getUsageRange() {
    const {loading, paymentProcessor} = this.props.paymentProcessor;
    const billingDate = (loading || !paymentProcessor) ? (new Date).getDate() : paymentProcessor.billingDate;
    const today = new Date();
    const daysInMonth = (new Date(today.getFullYear(), today.getMonth(), 0)).getDate();
    const startDayOfMonth = (billingDate > daysInMonth) ? daysInMonth : billingDate;
    const startDate = Date.parse(new Date(
      today.getFullYear(),
      (today.getMonth()),
      startDayOfMonth
    ));
    const endDate = (moment(startDate).add('1', 'month').valueOf());

    return {
      startDate: dates.startDate,
      endDate: dates.endDate
    };
  }

  getPaymentInfo() {
    const { loading } = this.props.paymentProcessor;
    if (loading || !this.props.paymentProcessor.paymentProcessor) {
      return {};
    }

    const {defaultPaymentMethod} = this.props.paymentProcessor.paymentProcessor;
    return defaultPaymentMethod;
  }

  getTransactions() {
    const { loading, credits, debits } = this.props.transactions;

    if (loading || !credits || !debits) {
      return [];
    }

    const creditMsg = 'payment - Thank you!';
    const convertedCredits = convertUnits(credits, creditMsg);
    const debitMsg = 'successful';
    const convertedDebits = convertUnits(debits, debitMsg);
    const transactions = [...convertedCredits, ...convertedDebits];

    return transactions.sort((t1, t2) => (t2.timestamp - t1.timestamp));

    function convertUnits(units, customMsg) {
      units.map((unit) => {
        const transaction = { ...unit };
        const titleizedType = unit.type.replace(/^\w/, (word) => {
          return word.toUpperCase();
        });
        transaction.amount = -unit.paid_amount;
        transaction.description = `${titleizedType} ${customMsg}`;
        transaction.timestamp = Date.parse(unit.created);
        transaction.created = `${
          moment(unit.created)
          .utc()
          .format('MMM DD, YYYY - HH:mm')} UTC
        `;
        return transaction;
      });
    }
  }

  calculateBalance(credits, debits) {
    const creditSum = credits.reduce((total, item) => {
      return total + item.paid_amount;
    }, 0);
    const debitSum = debits.reduce((total, item) => {
      return total + item.amount;
    }, 0);
    const balance = debitSum - creditSum;
    return balance;
  }

  removeCard() {
    const { removeCard } = this.props.mutations;
    // TODO: use apollo watchquery correctly so we don't have to call `refetch`
    const { refetch } = this.props.paymentProcessor;

    removeCard().then(() => (refetch()));
  }

  render() {
    const addCreditHandler = () => {
    };
    const linkParams = '/dashboard/billing/usage';

    // return (
    //   <div>
    //     <h1>Billing</h1>
    //   </div>
    //
    // )
    return (
      <div>
        <section>
          <div className="container">
            <div className="row">
              <div className="col-xs-12">
                <h1 className="title pull-left">Billing</h1>
              </div>
            </div>
          </div>
        </section>
        <section>
          <div className="container">
            <div className="row">
              <div className="col-xs-12 col-sm-6">
                <BalancePanel
                  amount={this.props.balance}
                  addCreditHandler={addCreditHandler}
                  cardData={this.getPaymentInfo()}
                />
              </div>
              <div className="col-xs-12 col-sm-6">
                <UsagePanel
                  amount={this.props.usage}
                  linkParams={linkParams}
                />
              </div>
            </div>
            <div className="row">
              <div className="col-xs-12">
                { !this.getPaymentInfo().id ? null :
                  <PaymentInfoPanel
                    removeCardHandler={this.removeCard.bind(this)}
                    paymentInfo={this.getPaymentInfo()}
                  />
                }
              </div>
            </div>
          </div>
        </section>
        <section>
          { !!this.getPaymentInfo().id   ? null : <AddCardForm
            // TODO: use apollo watchquery correctly so we don't have to call `refetch`
            updatePaymentInfo={this.props.paymentProcessor.refetch}/> }
        </section>
        <section>
          <TransactionsList transactions={this.getTransactions()} />
        </section>
      </div>
    );
  }
}

function getDates(loading, paymentProcessor) {
  const today = new Date();
  const billingDate =
    (loading || !paymentProcessor)
    ? today.getDate()
    : paymentProcessor.billingDate;
  const daysInMonth = (new Date(
    today.getFullYear(),
    (today.getMonth() - 1),
    0
  )).getDate();
  const startDayOfMonth =
    (billingDate > daysInMonth)
    ? daysInMonth
    : billingDate;
  const startDate = Date.parse(new Date(
    today.getFullYear(),
    (today.getMonth() - 1),
    startDayOfMonth
  ));

  const endDate = (moment(startDate).add('1', 'month').unix() * 1000);

  return {
    startDate,
    endDate
  };
}

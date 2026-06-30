import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  resetApp = () => {
    localStorage.removeItem("nanna_token");
    localStorage.removeItem("nanna_user");
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-crash-screen">
        <section>
          <h1>NANNA needs a quick reset</h1>
          <p>{this.state.error.message || "The interface hit a startup error."}</p>
          <button type="button" onClick={this.resetApp}>
            Reset session
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import {
  EuiCallOut,
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiSpacer,
} from '@elastic/eui';

const ErrorList = ({ errors }) => {
  return errors.map((error, errorIndex) => {
    const { message, statusCode, error: friendlyName } = error;
    return (
      <Fragment key={`checker-error-${errorIndex}`}>
        <EuiDescriptionListTitle>
          {statusCode} {friendlyName}
        </EuiDescriptionListTitle>
        <EuiDescriptionListDescription>
          {message}
        </EuiDescriptionListDescription>
      </Fragment>
    );
  });
};

export function CheckerErrors(props) {
  if (props.errors === undefined || props.errors.length === 0) {
    return null;
  }

  return (
    <Fragment>
      <EuiSpacer />
      <EuiCallOut
        title="Errors found"
        color="danger"
        className="eui-textLeft"
      >
        <p>
          There were some errors encountered in trying to check Elasticsearch
          settings. You need administrator rights to check the settings and, if
          needed, to enable the monitoring collection setting.
        </p>

        <EuiDescriptionList>
          <ErrorList {...props} />
        </EuiDescriptionList>
      </EuiCallOut>
    </Fragment>
  );
}

CheckerErrors.propTypes = {
  errors: PropTypes.array
};
